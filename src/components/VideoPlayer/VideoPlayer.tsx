import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import { useAppStore } from "@/store/useAppStore";
import DrawingCanvas from "@/components/DrawingCanvas/DrawingCanvas";
import DrawingEditOverlay, { type OverlayRect } from "@/components/DrawingCanvas/DrawingEditOverlay";
import TrackedDrawingsOverlay from "@/components/VideoPlayer/TrackedDrawingsOverlay";
import { isTrackDrawing } from "@/lib/drawing/keyframes";
import { formatTime } from "@/lib/utils/time";
import { Pencil, Pause, Play, ChevronLeft, ChevronRight, StepBack, StepForward } from "lucide-react";
import clsx from "clsx";

const FRAME_DURATION = 1 / 25; // predpoklad 25 fps pre krok po snímkach
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function VideoPlayer({ projectId }: { projectId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<OverlayRect | null>(null);
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);

  const videoUrl = useAppStore((s) => s.videoUrl);
  const isDrawingMode = useAppStore((s) => s.isDrawingMode);
  const setDrawingMode = useAppStore((s) => s.setDrawingMode);
  const setPlaybackState = useAppStore((s) => s.setPlaybackState);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const currentTime = useAppStore((s) => s.currentTime);
  const duration = useAppStore((s) => s.duration);
  const playbackRate = useAppStore((s) => s.playbackRate);
  const seekRequest = useAppStore((s) => s.seekRequest);
  const clearSeekRequest = useAppStore((s) => s.clearSeekRequest);
  const frozenDrawingId = useAppStore((s) => s.frozenDrawingId);
  const setFrozenDrawingId = useAppStore((s) => s.setFrozenDrawingId);
  const playQueue = useAppStore((s) => s.playQueue);
  const playQueueIndex = useAppStore((s) => s.playQueueIndex);
  const advancePlayQueue = useAppStore((s) => s.advancePlayQueue);
  const stopPlayQueue = useAppStore((s) => s.stopPlayQueue);

  const drawings = useLiveQuery(
    () => db.drawings.where("projectId").equals(projectId).toArray(),
    [projectId],
    []
  );

  const resumeAfterFreezeRef = useRef<number | null>(null);
  const lastFrozenAtRef = useRef<number>(-999);

  const setVideoEl = useAppStore((s) => s.setVideoEl);

  // uloženie video elementu do globálneho store, aby ho mohli ovládať klávesové skratky zvonka
  useEffect(() => {
    setVideoEl(videoRef.current);
    return () => setVideoEl(null);
  }, [videoUrl, setVideoEl]);

  // Kresby sa viažu na plochu samotného videa (bez čiernych pásov), inak by v exporte 1280×720 nesedeli.
  useEffect(() => {
    const container = containerRef.current;
    const v = videoRef.current;
    if (!container || !v) return;
    const measure = () => {
      if (!v.videoWidth) return setRect(null);
      setRect({ left: v.offsetLeft, top: v.offsetTop, width: v.clientWidth, height: v.clientHeight });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(v);
    v.addEventListener("loadedmetadata", measure);
    measure();
    return () => {
      ro.disconnect();
      v.removeEventListener("loadedmetadata", measure);
    };
  }, [videoUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || seekRequest === null) return;
    v.currentTime = seekRequest;
    clearSeekRequest();
  }, [seekRequest, clearSeekRequest]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = playbackRate;
  }, [playbackRate, videoUrl]);

  // Freeze-frame logika: pri prehrávaní, keď sa narazí na čas s kresbou, video sa zastaví
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !drawings || isDrawingMode) return;
    if (!isPlaying) return;
    if (resumeAfterFreezeRef.current !== null) return;

    const hit = drawings.find(
      (d) =>
        !isTrackDrawing(d) &&
        currentTime >= d.timestamp &&
        currentTime < d.timestamp + 0.18 &&
        d.timestamp > lastFrozenAtRef.current + 0.5
    );
    if (hit) {
      lastFrozenAtRef.current = hit.timestamp;
      v.pause();
      setPlaybackState({ isPlaying: false });
      setFrozenDrawingId(hit.id);
      const timeout = window.setTimeout(() => {
        setFrozenDrawingId(null);
        resumeAfterFreezeRef.current = null;
        v.play();
      }, hit.durationSec * 1000);
      resumeAfterFreezeRef.current = timeout;
    }
  }, [currentTime, drawings, isPlaying, isDrawingMode, setPlaybackState, setFrozenDrawingId]);

  useEffect(() => {
    return () => {
      if (resumeAfterFreezeRef.current) window.clearTimeout(resumeAfterFreezeRef.current);
    };
  }, []);

  // Sledovanie konca aktuálneho klipu v playlist/klip fronte -> posun na ďalší klip
  useEffect(() => {
    if (!playQueue) return;
    const clip = playQueue[playQueueIndex];
    if (!clip) return;
    if (currentTime >= clip.outPoint) {
      advancePlayQueue();
    }
  }, [currentTime, playQueue, playQueueIndex, advancePlayQueue]);

  const prevQueueRef = useRef<typeof playQueue>(null);
  useEffect(() => {
    if (prevQueueRef.current && playQueue === null) {
      videoRef.current?.pause();
    }
    prevQueueRef.current = playQueue;
  }, [playQueue]);

  // Po seeknutí na začiatok ďalšieho klipu vo fronte pokračuj v prehrávaní
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    function onSeeked() {
      if (useAppStore.getState().playQueue) {
        v!.play();
      }
    }
    v.addEventListener("seeked", onSeeked);
    return () => v.removeEventListener("seeked", onSeeked);
  }, [videoUrl]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  }

  function seekBy(delta: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(v.duration || Infinity, Math.max(0, v.currentTime + delta));
  }

  function stepFrame(dir: 1 | -1) {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, v.currentTime + dir * FRAME_DURATION);
  }

  const frozenDrawing = drawings?.find((d) => d.id === frozenDrawingId) ?? null;

  if (!videoUrl) {
    return (
      <div className="flex-1 flex items-center justify-center card">
        <p className="text-gray-500 text-sm">Najprv otvor video zápasu (tlačidlo v hornej lište).</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div ref={containerRef} className="relative flex-1 min-h-0 bg-black rounded-lg overflow-hidden flex items-center justify-center">
        <video
          ref={videoRef}
          src={videoUrl}
          className="max-h-full max-w-full"
          onTimeUpdate={(e) => setPlaybackState({ currentTime: e.currentTarget.currentTime })}
          onLoadedMetadata={(e) => setPlaybackState({ duration: e.currentTarget.duration })}
          onPlay={() => setPlaybackState({ isPlaying: true })}
          onPause={() => setPlaybackState({ isPlaying: false })}
        />
        {rect && !isDrawingMode && (
          <div className="absolute" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
            <TrackedDrawingsOverlay drawings={drawings ?? []} width={rect.width} height={rect.height} />
            {frozenDrawing && (
              <DrawingCanvas
                width={rect.width}
                height={rect.height}
                shapes={frozenDrawing.shapes}
                draft={null}
                editable={false}
                activeTool="arrow"
              />
            )}
          </div>
        )}
        {rect && isDrawingMode && (
          <DrawingEditOverlay
            projectId={projectId}
            rect={rect}
            toolbarSlot={toolbarSlot}
            onClose={() => setDrawingMode(false)}
          />
        )}
        {frozenDrawing && (
          <div className="absolute top-2 left-2 rounded bg-black/70 px-2 py-1 text-xs text-emerald-400 font-medium">
            FREEZE FRAME · kresba
          </div>
        )}
      </div>

      {isDrawingMode && <div ref={setToolbarSlot} />}

      <div className="card flex flex-wrap items-center gap-2 px-3 py-2">
        <button className="btn-ghost p-2" onClick={() => stepFrame(-1)} title=", – o snímku dozadu">
          <StepBack size={16} />
        </button>
        <button className="btn-ghost p-2" onClick={() => seekBy(-5)} title="Šípka vľavo – o 5s dozadu">
          <ChevronLeft size={16} />
        </button>
        <button className="btn-primary p-2.5" onClick={togglePlay} title="Medzerník – play/pauza">
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button className="btn-ghost p-2" onClick={() => seekBy(5)} title="Šípka vpravo – o 5s dopredu">
          <ChevronRight size={16} />
        </button>
        <button className="btn-ghost p-2" onClick={() => stepFrame(1)} title=". – o snímku dopredu">
          <StepForward size={16} />
        </button>

        <div className="text-sm text-gray-300 tabular-nums px-2">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        <div className="flex items-center gap-1 ml-2">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              className={clsx(
                "rounded px-2 py-1 text-xs",
                playbackRate === sp ? "bg-emerald-600 text-white" : "bg-pitch-700 text-gray-300 hover:bg-pitch-700/70"
              )}
              onClick={() => setPlaybackState({ playbackRate: sp })}
            >
              {sp}×
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {playQueue && (
          <div className="flex items-center gap-2 rounded bg-amber-600/20 border border-amber-600/50 px-2 py-1 text-xs text-amber-300">
            Klip {playQueueIndex + 1}/{playQueue.length}
            <button className="underline" onClick={stopPlayQueue}>Zastaviť</button>
          </div>
        )}

        <button
          className={clsx("btn-secondary", isDrawingMode && "bg-amber-600 text-white hover:bg-amber-500")}
          disabled={isPlaying}
          onClick={() => setDrawingMode(!isDrawingMode)}
          title="Kresliť na zastavený záber"
        >
          <Pencil size={15} /> {isDrawingMode ? "Kreslenie aktívne" : "Kresliť"}
        </button>
      </div>
    </div>
  );
}
