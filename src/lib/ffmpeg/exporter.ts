import { getFFmpeg, mountInputFile, terminateFFmpeg, unmountInputFile } from "@/lib/ffmpeg/ffmpegClient";
import { renderDrawingOverlayPng, renderTitleCardPng, EXPORT_WIDTH, EXPORT_HEIGHT } from "@/lib/ffmpeg/overlayRenderer";
import { activeTrackShapes, isTrackDrawing, trackWindow } from "@/lib/drawing/keyframes";
import { formatMinute } from "@/lib/utils/time";
import type { Clip, Drawing, Player, TagEvent, TagType } from "@/types";

export interface ExportInput {
  videoFile: File;
  clips: Clip[];
  drawings: Drawing[];
  tagEvents: TagEvent[];
  tagTypes: TagType[];
  players: Player[];
}

export interface ExportProgress {
  fraction: number; // 0..1
  label: string;
}

const ENCODE_ARGS = ["-r", "25", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "44100"];
const SCALE_FILTER = `scale=${EXPORT_WIDTH}:${EXPORT_HEIGHT}:force_original_aspect_ratio=decrease,pad=${EXPORT_WIDTH}:${EXPORT_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
const TRACK_FPS = 25;

export class ExportCancelled extends Error {}

export class PlaylistExporter {
  private cancelled = false;

  cancel() {
    this.cancelled = true;
    void terminateFFmpeg();
  }

  private checkCancelled() {
    if (this.cancelled) throw new ExportCancelled("Export zrušený užívateľom");
  }

  async run(input: ExportInput, onProgress: (p: ExportProgress) => void): Promise<Blob> {
    try {
      return await this.runInner(input, onProgress);
    } catch (e) {
      if (this.cancelled) throw new ExportCancelled("Export zrušený užívateľom");
      throw e;
    }
  }

  private async runInner(input: ExportInput, onProgress: (p: ExportProgress) => void): Promise<Blob> {
    const ffmpeg = await getFFmpeg();
    this.checkCancelled();

    const inputPath = await mountInputFile(ffmpeg, input.videoFile);
    const tagTypeMap = new Map(input.tagTypes.map((t) => [t.id, t]));
    const tagEventMap = new Map(input.tagEvents.map((e) => [e.id, e]));
    const playerMap = new Map(input.players.map((p) => [p.id, p]));

    const freezeDrawings = input.drawings.filter((d) => !isTrackDrawing(d));
    const trackDrawings = input.drawings.filter(isTrackDrawing);
    const tracksInClip = (clip: Clip) =>
      trackDrawings.filter((d) => {
        const w = trackWindow(d);
        return w.end >= clip.inPoint && w.start <= clip.outPoint;
      });

    // Celkový počet ffmpeg krokov pre progress bar (hrubý odhad).
    let totalSteps = input.clips.length * 2 + 1; // trim + title per klip + finálny concat
    for (const clip of input.clips) {
      if (tracksInClip(clip).length > 0) totalSteps += 1;
      const n = freezeDrawings.filter((d) => d.timestamp >= clip.inPoint && d.timestamp <= clip.outPoint).length;
      totalSteps += n * 4; // extract frame, overlay png, still video, (part pred/za sa počíta nižšie)
      if (n > 0) totalSteps += n + 1 + 1; // partA/partB segmenty + concat klipu
    }
    let doneSteps = 0;
    const report = (label: string) => {
      doneSteps++;
      onProgress({ fraction: Math.min(0.98, doneSteps / totalSteps), label });
    };

    const finalClipFiles: string[] = [];

    for (let i = 0; i < input.clips.length; i++) {
      this.checkCancelled();
      const clip = input.clips[i];
      const baseFile = `clip_${i}_base.mp4`;
      const titledFile = `clip_${i}_titled.mp4`;

      await ffmpeg.exec([
        "-ss", String(clip.inPoint),
        "-to", String(clip.outPoint),
        "-i", inputPath,
        "-vf", SCALE_FILTER,
        ...ENCODE_ARGS,
        baseFile,
      ]);
      report(`Strihám klip ${i + 1}/${input.clips.length}`);
      this.checkCancelled();

      let sourceFile = baseFile;
      const clipTracks = tracksInClip(clip);
      if (clipTracks.length > 0) {
        const clipDuration = clip.outPoint - clip.inPoint;
        const winStart = Math.max(0, Math.min(...clipTracks.map((d) => trackWindow(d).start)) - clip.inPoint);
        const winEnd = Math.min(clipDuration, Math.max(...clipTracks.map((d) => trackWindow(d).end)) - clip.inPoint);
        const frameCount = Math.max(1, Math.ceil((winEnd - winStart) * TRACK_FPS));
        const frameName = (f: number) => `trk_${i}_${String(f).padStart(5, "0")}.png`;

        for (let f = 0; f < frameCount; f++) {
          this.checkCancelled();
          const t = clip.inPoint + winStart + f / TRACK_FPS;
          await ffmpeg.writeFile(frameName(f), await renderDrawingOverlayPng(activeTrackShapes(clipTracks, t)));
          if (f % TRACK_FPS === 0) {
            onProgress({
              fraction: Math.min(0.98, doneSteps / totalSteps),
              label: `Kreslím pohyblivé kresby v klipe ${i + 1} (${f}/${frameCount})`,
            });
          }
        }

        const trackedFile = `clip_${i}_tracked.mp4`;
        // Sekvencia sa posunie na začiatok okna; po jej konci overlay púšťa video ďalej bez kresby.
        await ffmpeg.exec([
          "-i", baseFile,
          "-framerate", String(TRACK_FPS),
          "-i", `trk_${i}_%05d.png`,
          "-filter_complex", `[1:v]setpts=PTS-STARTPTS+${winStart.toFixed(3)}/TB[ov];[0:v][ov]overlay=0:0:eof_action=pass[v]`,
          "-map", "[v]",
          "-map", "0:a?",
          ...ENCODE_ARGS,
          trackedFile,
        ]);
        for (let f = 0; f < frameCount; f++) await ffmpeg.deleteFile(frameName(f));
        report(`Vypaľujem pohyblivé kresby ${i + 1}/${input.clips.length}`);
        sourceFile = trackedFile;
      }

      const titleLines = buildTitleLines(clip, tagEventMap, tagTypeMap, playerMap);
      const titlePng = await renderTitleCardPng(titleLines);
      await ffmpeg.writeFile(`title_${i}.png`, titlePng);
      await ffmpeg.exec([
        "-i", sourceFile,
        "-i", `title_${i}.png`,
        "-filter_complex", "overlay=0:0:enable='between(t,0,2.5)'",
        "-c:a", "copy",
        titledFile,
      ]);
      report(`Vkladám titulok ${i + 1}/${input.clips.length}`);

      const clipDrawings = freezeDrawings
        .filter((d) => d.timestamp >= clip.inPoint && d.timestamp <= clip.outPoint)
        .sort((a, b) => a.timestamp - b.timestamp);

      if (clipDrawings.length === 0) {
        finalClipFiles.push(titledFile);
        continue;
      }

      const segmentFiles: string[] = [];
      let prevT = 0;
      const clipDuration = clip.outPoint - clip.inPoint;

      for (let k = 0; k < clipDrawings.length; k++) {
        this.checkCancelled();
        const drawing = clipDrawings[k];
        const t = Math.min(clipDuration, Math.max(0, drawing.timestamp - clip.inPoint));

        if (t > prevT + 0.05) {
          const partFile = `part_${i}_${k}.mp4`;
          await ffmpeg.exec([
            "-ss", String(prevT), "-to", String(t), "-i", titledFile,
            ...ENCODE_ARGS,
            partFile,
          ]);
          segmentFiles.push(partFile);
          report(`Spracúvam kresby v klipe ${i + 1}`);
        }

        const framePng = `frame_${i}_${k}.png`;
        await ffmpeg.exec(["-ss", String(t), "-i", titledFile, "-frames:v", "1", "-vf", `scale=${EXPORT_WIDTH}:${EXPORT_HEIGHT}`, framePng]);
        report(`Extrahujem snímku ${i + 1}.${k + 1}`);

        const drawingPng = `drawing_${i}_${k}.png`;
        const overlayPng = await renderDrawingOverlayPng(drawing.shapes);
        await ffmpeg.writeFile(drawingPng, overlayPng);

        const frozenPng = `frozen_${i}_${k}.png`;
        await ffmpeg.exec(["-i", framePng, "-i", drawingPng, "-filter_complex", "overlay=0:0", "-frames:v", "1", frozenPng]);
        report(`Vypaľujem kresbu ${i + 1}.${k + 1}`);

        const freezeFile = `freeze_${i}_${k}.mp4`;
        await ffmpeg.exec([
          "-loop", "1", "-i", frozenPng,
          "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
          "-t", String(drawing.durationSec),
          ...ENCODE_ARGS,
          freezeFile,
        ]);
        segmentFiles.push(freezeFile);
        report(`Generujem freeze-frame ${i + 1}.${k + 1}`);

        prevT = t;
      }

      if (prevT < clipDuration - 0.05) {
        const partFile = `part_${i}_tail.mp4`;
        await ffmpeg.exec([
          "-ss", String(prevT), "-to", String(clipDuration), "-i", titledFile,
          ...ENCODE_ARGS,
          partFile,
        ]);
        segmentFiles.push(partFile);
      }

      const listName = `concat_clip_${i}.txt`;
      await ffmpeg.writeFile(listName, new TextEncoder().encode(segmentFiles.map((f) => `file '${f}'`).join("\n")));
      const clipFinal = `clip_${i}_final.mp4`;
      await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", listName, "-c", "copy", clipFinal]);
      report(`Spájam segmenty klipu ${i + 1}`);

      finalClipFiles.push(clipFinal);
    }

    this.checkCancelled();
    const finalListName = "concat_final.txt";
    await ffmpeg.writeFile(finalListName, new TextEncoder().encode(finalClipFiles.map((f) => `file '${f}'`).join("\n")));
    await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", finalListName, "-c", "copy", "output.mp4"]);
    report("Finalizujem export");

    const data = await ffmpeg.readFile("output.mp4");
    await unmountInputFile(ffmpeg);

    onProgress({ fraction: 1, label: "Hotovo" });
    return new Blob([data as unknown as ArrayBuffer], { type: "video/mp4" });
  }
}

function buildTitleLines(
  clip: Clip,
  tagEventMap: Map<string, TagEvent>,
  tagTypeMap: Map<string, TagType>,
  playerMap: Map<string, Player>
): string[] {
  const ev = clip.sourceTagEventId ? tagEventMap.get(clip.sourceTagEventId) : undefined;
  if (!ev) return [clip.name];
  const type = tagTypeMap.get(ev.tagTypeId);
  const player = ev.playerId ? playerMap.get(ev.playerId) : undefined;
  const minute = formatMinute(ev.timestamp, ev.half);
  const line1 = type?.name ?? clip.name;
  const parts = [`${minute} min`, ev.team === "my" ? "môj tím" : "súper"];
  if (player) parts.push(`#${player.number} ${player.name}`);
  return [line1, parts.join(" · ")];
}
