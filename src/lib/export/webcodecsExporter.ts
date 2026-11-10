import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  StreamTarget,
  canEncodeAudio,
  canEncodeVideo,
  type AudioCodec,
  type InputAudioTrack,
  type StreamTargetChunk,
} from "mediabunny";
import { drawShapesOnCanvas } from "@/lib/drawing/renderShapes";
import { activeTrackShapes, isTrackDrawing, trackWindow } from "@/lib/drawing/keyframes";
import { drawTitleCard } from "@/lib/ffmpeg/overlayRenderer";
import { buildTitleLines, ExportCancelled, type ExportInput, type ExportProgress } from "@/lib/ffmpeg/exporter";
import type { Drawing } from "@/types";

/*
 * Export cez WebCodecs: video sa dekóduje aj kóduje hardvérovo (grafická karta), titulky a kresby sa
 * dokresľujú na canvas po snímkach a výsledok ide rovno do MP4 – bez opakovaného prekódovania ako pri ffmpeg.wasm.
 */

const TITLE_SECONDS = 2.5;
const FREEZE_FPS = 25;

export type ExportTarget = { kind: "file"; writable: FileSystemWritableFileStream } | { kind: "memory" };

/** Vie tento prehliadač exportovať cez WebCodecs (H.264 vo zvolenom rozlíšení)? */
export async function webCodecsSupported(): Promise<boolean> {
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") return false;
  try {
    return await canEncodeVideo("avc", { width: 1280, height: 720 });
  } catch {
    return false;
  }
}

interface FreezePoint {
  ts: number;
  drawing: Drawing;
}

export class WebCodecsExporter {
  private cancelled = false;
  private output: Output | null = null;

  cancel() {
    this.cancelled = true;
    void this.output?.cancel();
  }

  private checkCancelled() {
    if (this.cancelled) throw new ExportCancelled("Export zrušený užívateľom");
  }

  /** Vráti Blob pri exporte do pamäte, pri zápise do súboru null. */
  async run(input: ExportInput, target: ExportTarget, onProgress: (p: ExportProgress) => void): Promise<Blob | null> {
    const media = new Input({ formats: ALL_FORMATS, source: new BlobSource(input.videoFile) });
    try {
      return await this.runInner(media, input, target, onProgress);
    } catch (e) {
      if (this.output && this.output.state !== "finalized" && this.output.state !== "canceled") {
        await this.output.cancel().catch(() => undefined);
      }
      if (this.cancelled) throw new ExportCancelled("Export zrušený užívateľom");
      throw e;
    } finally {
      media.dispose();
    }
  }

  private async runInner(
    media: Input,
    input: ExportInput,
    target: ExportTarget,
    onProgress: (p: ExportProgress) => void
  ): Promise<Blob | null> {
    onProgress({ fraction: 0, label: "Čítam video..." });
    const videoTrack = await media.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("Vo videu sa nenašla obrazová stopa.");
    if (!(await videoTrack.canDecode())) {
      throw new Error("Prehliadač nevie dekódovať tento formát videa cez WebCodecs.");
    }
    const srcW = await videoTrack.getDisplayWidth();
    const srcH = await videoTrack.getDisplayHeight();

    // 1080p pre Full HD a vyššie zdroje, inak 720p (zbytočne nezväčšujeme).
    let W = srcH >= 1000 ? 1920 : 1280;
    let H = srcH >= 1000 ? 1080 : 720;
    if (!(await canEncodeVideo("avc", { width: W, height: H }))) {
      W = 1280;
      H = 720;
    }
    // pevný strop dátového toku: dobrá kvalita pre futbal, ale súbor nenarastie na desiatky MB za minútu
    const videoBitrate = H >= 1080 ? 10_000_000 : 6_000_000;

    const audioTrack = await pickAudioTrack(await media.getPrimaryAudioTrack());
    const audioCodec = audioTrack ? await pickAudioCodec(audioTrack) : null;

    // Plocha, kde je video na výstupe (zachovaný pomer strán, čierne pásy okolo); kresby sú viazané na ňu.
    const scale = Math.min(W / srcW, H / srcH);
    const rectW = Math.round(srcW * scale);
    const rectH = Math.round(srcH * scale);
    const rectX = Math.round((W - rectW) / 2);
    const rectY = Math.round((H - rectH) / 2);

    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext("2d", { alpha: false }) as OffscreenCanvasRenderingContext2D;
    const overlay = new OffscreenCanvas(rectW, rectH);
    const overlayCtx = overlay.getContext("2d") as unknown as CanvasRenderingContext2D;

    const sink = new CanvasSink(videoTrack, { width: rectW, height: rectH, fit: "fill", poolSize: 3 });
    const audioSink = audioTrack && audioCodec ? new AudioSampleSink(audioTrack) : null;

    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: target.kind === "memory" ? "in-memory" : false }),
      target:
        target.kind === "file"
          ? new StreamTarget(target.writable as unknown as WritableStream<StreamTargetChunk>, { chunked: true })
          : new BufferTarget(),
    });
    this.output = output;
    const videoSource = new CanvasSource(canvas, {
      codec: "avc",
      bitrate: videoBitrate,
      bitrateMode: "variable",
      keyFrameInterval: 2,
    });
    output.addVideoTrack(videoSource, { frameRate: 25 });
    let audioSource: AudioSampleSource | null = null;
    let channels = 2;
    let sampleRate = 48000;
    if (audioSink && audioTrack && audioCodec) {
      channels = Math.min(2, audioTrack.numberOfChannels || 2);
      sampleRate = audioTrack.sampleRate || 48000;
      audioSource = new AudioSampleSource({
        codec: audioCodec,
        quality: QUALITY_HIGH,
        transform: { numberOfChannels: channels, sampleRate },
      });
      output.addAudioTrack(audioSource);
    }
    await output.start();
    this.checkCancelled();

    const tagTypeMap = new Map(input.tagTypes.map((t) => [t.id, t]));
    const tagEventMap = new Map(input.tagEvents.map((e) => [e.id, e]));
    const playerMap = new Map(input.players.map((p) => [p.id, p]));
    const freezeDrawings = input.drawings.filter((d) => !isTrackDrawing(d));
    const trackDrawings = input.drawings.filter(isTrackDrawing);

    const totalSrc = input.clips.reduce((s, c) => s + Math.max(0, c.outPoint - c.inPoint), 0) || 1;
    let doneSrc = 0;
    const started = performance.now();
    let lastReport = 0;
    const report = (clipIdx: number, force = false) => {
      const now = performance.now();
      if (!force && now - lastReport < 250) return;
      lastReport = now;
      const elapsed = (now - started) / 1000;
      const speed = elapsed > 0.5 ? doneSrc / elapsed : 0;
      const speedText = speed > 0 ? ` · ${speed.toFixed(1).replace(".", ",")}× rýchlosť` : "";
      onProgress({
        fraction: Math.min(0.99, doneSrc / totalSrc),
        label: `Klip ${clipIdx + 1}/${input.clips.length} (${W}×${H})${speedText}`,
      });
    };

    let base = 0; // čas začiatku aktuálneho klipu vo výstupe
    let lastVideoEnd = 0;

    for (let i = 0; i < input.clips.length; i++) {
      this.checkCancelled();
      const clip = input.clips[i];
      const clipLen = Math.max(0, clip.outPoint - clip.inPoint);
      if (clipLen <= 0.01) continue;

      const titleLines = buildTitleLines(clip, tagEventMap, tagTypeMap, playerMap);
      const freezes: FreezePoint[] = freezeDrawings
        .filter((d) => d.timestamp >= clip.inPoint && d.timestamp < clip.outPoint)
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((d) => ({ ts: d.timestamp, drawing: d }));
      const clipTracks = trackDrawings.filter((d) => {
        const w = trackWindow(d);
        return w.end >= clip.inPoint && w.start <= clip.outPoint;
      });
      // posun výstupného času spôsobený freeze-mi, ktoré sú v zdroji pred časom t (vrátane)
      const shiftAt = (t: number) => freezes.reduce((s, f) => (f.ts <= t ? s + f.drawing.durationSec : s), 0);
      const outTime = (t: number) => base + (t - clip.inPoint) + shiftAt(t);

      const compose = (frame: CanvasImageSource, srcT: number, freeze: Drawing | null) => {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(frame, rectX, rectY, rectW, rectH);
        const shapes = [...(clipTracks.length ? activeTrackShapes(clipTracks, srcT) : []), ...(freeze?.shapes ?? [])];
        if (shapes.length) {
          drawShapesOnCanvas(overlayCtx, shapes, rectW, rectH);
          ctx.drawImage(overlay, rectX, rectY);
        }
        if (srcT - clip.inPoint < TITLE_SECONDS) drawTitleCard(ctx, titleLines, W, H);
      };

      // --- obraz ---
      let nextFreeze = 0;
      for await (const wrapped of sink.canvases(clip.inPoint, clip.outPoint)) {
        this.checkCancelled();
        const t0 = Math.max(clip.inPoint, wrapped.timestamp);
        const t1 = Math.min(clip.outPoint, wrapped.timestamp + (wrapped.duration || 1 / 25));
        let segStart = t0;
        // freeze kresby, ktoré padnú do tejto snímky: snímka sa rozdelí a vloží sa zastavený obraz s kresbou
        while (nextFreeze < freezes.length && freezes[nextFreeze].ts < t1) {
          const f = freezes[nextFreeze++];
          const fts = Math.max(segStart, f.ts);
          if (fts - segStart > 0.001) {
            compose(wrapped.canvas, segStart, null);
            lastVideoEnd = await addFrame(videoSource, outTime(segStart), fts - segStart, lastVideoEnd);
          }
          compose(wrapped.canvas, fts, f.drawing);
          const freezeStart = base + (fts - clip.inPoint) + shiftAt(fts) - f.drawing.durationSec;
          const n = Math.max(1, Math.round(f.drawing.durationSec * FREEZE_FPS));
          for (let k = 0; k < n; k++) {
            this.checkCancelled();
            lastVideoEnd = await addFrame(videoSource, freezeStart + k / FREEZE_FPS, 1 / FREEZE_FPS, lastVideoEnd);
          }
          segStart = fts;
        }
        if (t1 - segStart > 0.001) {
          compose(wrapped.canvas, segStart, null);
          lastVideoEnd = await addFrame(videoSource, outTime(segStart), t1 - segStart, lastVideoEnd);
        }
        doneSrc += Math.max(0, t1 - t0) * (audioSource ? 0.85 : 1);
        report(i);
      }

      // --- zvuk (vrátane ticha počas freeze) ---
      if (audioSink && audioSource) {
        let silenceIdx = 0;
        const emitSilenceUpTo = async (t: number) => {
          while (silenceIdx < freezes.length && freezes[silenceIdx].ts <= t) {
            const f = freezes[silenceIdx++];
            const start = base + (f.ts - clip.inPoint) + shiftAt(f.ts) - f.drawing.durationSec;
            await addSilence(audioSource!, start, f.drawing.durationSec, channels, sampleRate);
          }
        };
        for await (const sample of audioSink.samples(clip.inPoint, clip.outPoint)) {
          this.checkCancelled();
          try {
            const s0 = sample.timestamp;
            const sr = sample.sampleRate;
            const s1 = s0 + sample.numberOfFrames / sr;
            const a0 = Math.max(s0, clip.inPoint);
            const a1 = Math.min(s1, clip.outPoint);
            if (a1 <= a0) continue;
            const cuts = [a0, ...freezes.map((f) => f.ts).filter((t) => t > a0 && t < a1), a1];
            for (let c = 0; c < cuts.length - 1; c++) {
              const p0 = cuts[c];
              const p1 = cuts[c + 1];
              await emitSilenceUpTo(p0);
              const f0 = Math.max(0, Math.round((p0 - s0) * sr));
              const f1 = Math.min(sample.numberOfFrames, Math.round((p1 - s0) * sr));
              if (f1 - f0 < 1) continue;
              const piece = sample.trim(f0, f1);
              piece.setTimestamp(outTime(p0));
              await audioSource.add(piece);
              piece.close();
            }
            doneSrc += (a1 - a0) * 0.15;
          } finally {
            sample.close();
          }
          report(i);
        }
        await emitSilenceUpTo(Infinity);
      }

      base += clipLen + freezes.reduce((s, f) => s + f.drawing.durationSec, 0);
      lastVideoEnd = Math.max(lastVideoEnd, base);
      report(i, true);
    }

    this.checkCancelled();
    onProgress({ fraction: 0.99, label: "Dokončujem súbor..." });
    await output.finalize();
    onProgress({ fraction: 1, label: "Hotovo" });

    if (target.kind === "memory") {
      const buf = (output.target as BufferTarget).buffer;
      if (!buf) throw new Error("Export nevytvoril žiadne dáta.");
      return new Blob([buf], { type: "video/mp4" });
    }
    return null;
  }
}

/** Pridá snímku tak, aby časy na výstupe vždy rástli (dekodér môže vrátiť snímky s miernym prekryvom). */
async function addFrame(source: CanvasSource, ts: number, dur: number, lastEnd: number): Promise<number> {
  const start = Math.max(ts, lastEnd - 0.0005);
  const end = Math.max(start + 0.001, ts + dur);
  await source.add(start, end - start);
  return end;
}

async function addSilence(source: AudioSampleSource, start: number, duration: number, channels: number, sampleRate: number) {
  const chunk = 1024 * 8;
  let frames = Math.round(duration * sampleRate);
  let t = start;
  while (frames > 0) {
    const n = Math.min(chunk, frames);
    const sample = new AudioSample({
      data: new Float32Array(n * channels),
      format: "f32",
      numberOfChannels: channels,
      sampleRate,
      timestamp: t,
    });
    await source.add(sample);
    sample.close();
    frames -= n;
    t += n / sampleRate;
  }
}

async function pickAudioTrack(track: InputAudioTrack | null): Promise<InputAudioTrack | null> {
  if (!track) return null;
  try {
    return (await track.canDecode()) ? track : null;
  } catch {
    return null;
  }
}

async function pickAudioCodec(track: InputAudioTrack): Promise<AudioCodec | null> {
  const opts = { numberOfChannels: Math.min(2, track.numberOfChannels || 2), sampleRate: track.sampleRate || 48000 };
  for (const codec of ["aac", "opus"] as const) {
    try {
      if (await canEncodeAudio(codec, { ...opts, quality: QUALITY_HIGH })) return codec;
    } catch {
      /* skúsi ďalší kodek */
    }
  }
  return null;
}
