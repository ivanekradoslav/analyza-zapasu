import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDrawingEditor } from "@/components/DrawingCanvas/useDrawingEditor";
import DrawingCanvas from "@/components/DrawingCanvas/DrawingCanvas";
import DrawingToolbar from "@/components/DrawingCanvas/DrawingToolbar";
import { useAppStore } from "@/store/useAppStore";
import { findDrawingForEdit, upsertDrawing, deleteDrawing } from "@/lib/db/operations";
import { isTrackDrawing, KEYFRAME_EPSILON, removeKeyframeAt, shapesAtTime, upsertKeyframe } from "@/lib/drawing/keyframes";
import { shapeAnchor, translateShape } from "@/lib/drawing/shapeGeometry";
import { PlayerTracker, simplifyTrackedKeyframes } from "@/lib/tracking/playerTracker";
import { formatKeyTime } from "@/components/DrawingCanvas/DrawingToolbar";
import { newId } from "@/lib/utils/id";
import type { Drawing, DrawingMode, Keyframe, Point, Shape } from "@/types";

export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Props {
  projectId: string;
  rect: OverlayRect;
  toolbarSlot: HTMLElement | null;
  onClose: () => void;
}

const TRACK_STEP_SEC = 0.2;
const TRACK_MAX_SEC = 10;

function videoTime() {
  const s = useAppStore.getState();
  return s.videoEl?.currentTime ?? s.currentTime;
}

export default function DrawingEditOverlay({ projectId, rect, toolbarSlot, onClose }: Props) {
  const [existing, setExisting] = useState<Drawing | null | undefined>(undefined);
  const [mode, setMode] = useState<DrawingMode>("freeze");
  const [durationSec, setDurationSec] = useState(4);
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const keyframesRef = useRef<Keyframe[]>([]);
  const modeRef = useRef<DrawingMode>("freeze");
  const previewEndRef = useRef<number | null>(null);
  const [textPrompt, setTextPrompt] = useState<Point | null>(null);
  const trackJobRef = useRef<{ cancelled: boolean } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [trackStatus, setTrackStatus] = useState<string | null>(null);

  const currentTime = useAppStore((s) => s.currentTime);
  const videoEl = useAppStore((s) => s.videoEl);
  const activeTool = useAppStore((s) => s.activeShapeTool);
  const setActiveTool = useAppStore((s) => s.setActiveShapeTool);
  const color = useAppStore((s) => s.activeDrawColor);
  const setColor = useAppStore((s) => s.setActiveDrawColor);
  const strokeWidth = useAppStore((s) => s.activeStrokeWidth);
  const setStrokeWidth = useAppStore((s) => s.setActiveStrokeWidth);

  const updateKeyframes = useCallback((fn: (k: Keyframe[]) => Keyframe[]) => {
    const next = fn(keyframesRef.current);
    keyframesRef.current = next;
    setKeyframes(next);
    return next;
  }, []);

  const handleCommit = useCallback(
    (shapes: Shape[]) => {
      if (modeRef.current !== "track") return;
      updateKeyframes((k) => upsertKeyframe(k, videoTime(), shapes));
    },
    [updateKeyframes]
  );

  const editor = useDrawingEditor(handleCommit);
  const { load } = editor;

  function switchMode(m: DrawingMode) {
    modeRef.current = m;
    setMode(m);
  }

  useEffect(() => {
    const t0 = videoTime();
    findDrawingForEdit(projectId, t0).then((d) => {
      setExisting(d ?? null);
      if (!d) return;
      setDurationSec(d.durationSec);
      if (isTrackDrawing(d)) {
        switchMode("track");
        keyframesRef.current = d.keyframes;
        setKeyframes(d.keyframes);
        load(shapesAtTime(d.keyframes, t0));
      } else {
        load(d.shapes);
      }
    });
  }, [projectId, load]);

  // Pohyblivá kresba: pri posune videa ukáž tvary v polohe pre aktuálny čas.
  useEffect(() => {
    if (mode !== "track" || keyframesRef.current.length === 0) return;
    load(shapesAtTime(keyframesRef.current, currentTime));
  }, [currentTime, mode, load]);

  useEffect(() => {
    const end = previewEndRef.current;
    if (end !== null && currentTime >= end) {
      previewEndRef.current = null;
      videoEl?.pause();
    }
  }, [currentTime, videoEl]);

  const { selectedId, removeShape } = editor;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (!selectedId || tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      removeShape(selectedId);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, removeShape]);

  function handleModeChange(m: DrawingMode) {
    if (m === mode) return;
    if (m === "track") {
      const shapes = editor.shapes;
      updateKeyframes(() => (shapes.length > 0 ? [{ time: videoTime(), shapes }] : []));
      setDurationSec(1);
    } else {
      setDurationSec(4);
    }
    switchMode(m);
  }

  function handlePointerDown(p: Point) {
    if (activeTool === "move") {
      editor.beginMove(p, rect.width, rect.height);
    } else if (activeTool === "text") {
      setTextPrompt(p);
    } else {
      editor.startShape(activeTool, p, color, strokeWidth);
    }
  }

  function handlePointerMove(p: Point) {
    if (activeTool === "move") editor.updateMove(p);
    else editor.updateShapeDrag(p);
  }

  function handlePointerUp() {
    if (activeTool === "move") editor.endMove();
    else if (activeTool !== "text") editor.endDrag(activeTool);
  }

  function handleDoubleClick() {
    if (activeTool === "polyline" || activeTool === "zone") editor.finishMultiPoint();
  }

  function seekTo(t: number) {
    if (!videoEl) return;
    videoEl.pause();
    videoEl.currentTime = Math.min(videoEl.duration || Infinity, Math.max(0, t));
  }

  function handleDeleteKeyframe() {
    const t = videoTime();
    const next = updateKeyframes((k) => removeKeyframeAt(k, t));
    load(next.length > 0 ? shapesAtTime(next, t) : []);
  }

  async function handleTrack() {
    const targetId = editor.selectedId ?? editor.shapes[editor.shapes.length - 1]?.id;
    if (!videoEl || !targetId) return;
    videoEl.pause();
    const t0 = videoTime();
    const startShapes = editor.shapes;
    updateKeyframes((k) => upsertKeyframe(k, t0, startShapes));

    const tracker = new PlayerTracker(videoEl);
    tracker.start(startShapes.find((s) => s.id === targetId)!);
    const job = { cancelled: false };
    trackJobRef.current = job;
    setTracking(true);
    setTrackStatus("Sledujem hráča…");

    const created = new Set<number>();
    const end = Math.min(videoEl.duration || Infinity, t0 + TRACK_MAX_SEC);
    let lostAt: number | null = null;
    for (let i = 1; t0 + i * TRACK_STEP_SEC <= end && !job.cancelled; i++) {
      const t = t0 + i * TRACK_STEP_SEC;
      const res = await tracker.step(t);
      if (job.cancelled) break;
      if (!res) {
        lostAt = t;
        break;
      }
      const existed = keyframesRef.current.some((k) => Math.abs(k.time - t) <= KEYFRAME_EPSILON);
      const shapes = shapesAtTime(keyframesRef.current, t).map((s) => {
        if (s.id !== targetId) return s;
        const a = shapeAnchor(s);
        return translateShape(s, res.anchor.x - a.x, res.anchor.y - a.y);
      });
      if (!existed) created.add(t);
      const next = updateKeyframes((k) => upsertKeyframe(k, t, shapes));
      load(shapesAtTime(next, t));
      setTrackStatus(`Sledujem… ${formatKeyTime(t)} · zhoda ${Math.round(res.score * 100)} %`);
    }

    updateKeyframes((k) => simplifyTrackedKeyframes(k, targetId, created));
    trackJobRef.current = null;
    setTracking(false);
    if (job.cancelled) setTrackStatus("Sledovanie zastavené.");
    else if (lostAt !== null)
      setTrackStatus(`Hráča som stratil na ${formatKeyTime(lostAt)}. Posuň kruh na správne miesto (Presunúť) a spusti sledovanie znova.`);
    else setTrackStatus("Hotovo. Skontroluj pohyb cez Náhľad; chybné miesto oprav posunutím kruhu.");
  }

  useEffect(() => () => {
    if (trackJobRef.current) trackJobRef.current.cancelled = true;
  }, []);

  function handlePreview() {
    const kfs = keyframesRef.current;
    if (!videoEl || kfs.length < 2) return;
    previewEndRef.current = kfs[kfs.length - 1].time + durationSec;
    videoEl.currentTime = kfs[0].time;
    void videoEl.play();
  }

  async function handleSave() {
    const now = videoTime();
    const base = {
      id: existing?.id ?? newId(),
      projectId,
      durationSec,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    let drawing: Drawing | null = null;
    if (mode === "track") {
      const kfs = keyframesRef.current.filter((k) => k.shapes.length > 0);
      if (kfs.length > 0) {
        drawing = { ...base, mode: "track", keyframes: kfs, timestamp: kfs[0].time, shapes: kfs[0].shapes };
      }
    } else if (editor.shapes.length > 0) {
      const timestamp = existing && !isTrackDrawing(existing) ? existing.timestamp : now;
      drawing = { ...base, mode: "freeze", timestamp, shapes: editor.shapes };
    }

    if (drawing) await upsertDrawing(drawing);
    else if (existing) await deleteDrawing(existing.id);
    onClose();
  }

  if (existing === undefined) return null;

  const activeKeyframeIndex = keyframes.findIndex((k) => Math.abs(k.time - currentTime) <= KEYFRAME_EPSILON);

  let hint: string;
  if (activeTool === "move") {
    hint = "Chyť tvar a potiahni. Za úchyt meníš tvar, inde presúvaš celý tvar. Delete zmaže vybraný.";
  } else if (mode === "track" && keyframes.length > 0) {
    hint = "Posuň video (+0.2s / +1s), prepni na Presunúť a potiahni tvar za hráčom — vznikne ďalší kľúčový bod.";
  } else if (mode === "track") {
    hint = "Pohyblivá kresba: nakresli tvar, napr. kruh pod hráča alebo líniu obrany.";
  } else if (activeTool === "polyline" || activeTool === "zone") {
    hint = "Klikaním pridávaš body, dvojklikom dokončíš tvar";
  } else if (activeTool === "text") {
    hint = "Klikni na miesto a napíš text";
  } else {
    hint = "Ťahaním nakresli tvar";
  }

  return (
    <>
      <div className="absolute" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
        <DrawingCanvas
          width={rect.width}
          height={rect.height}
          shapes={editor.shapes}
          draft={editor.draft}
          editable
          activeTool={activeTool}
          selectedId={editor.selectedId}
          onPointerDownPoint={handlePointerDown}
          onPointerMovePoint={handlePointerMove}
          onPointerUpPoint={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        />
        {textPrompt && (
          <TextInputPopup
            point={textPrompt}
            width={rect.width}
            height={rect.height}
            onConfirm={(text) => {
              editor.addText(textPrompt, text, color, strokeWidth);
              setTextPrompt(null);
            }}
            onCancel={() => setTextPrompt(null)}
          />
        )}
      </div>
      {toolbarSlot &&
        createPortal(
          <DrawingToolbar
            mode={mode}
            onModeChange={handleModeChange}
            activeTool={activeTool}
            onToolChange={setActiveTool}
            color={color}
            onColorChange={setColor}
            strokeWidth={strokeWidth}
            onStrokeWidthChange={setStrokeWidth}
            durationSec={durationSec}
            onDurationChange={setDurationSec}
            canUndo={editor.canUndo}
            canRedo={editor.canRedo}
            onUndo={editor.undo}
            onRedo={editor.redo}
            onClear={editor.clearAll}
            hasSelection={!!editor.selectedId}
            onDeleteSelected={() => editor.selectedId && editor.removeShape(editor.selectedId)}
            onSave={handleSave}
            onCancel={onClose}
            hint={hint}
            keyframeTimes={keyframes.map((k) => k.time)}
            activeKeyframeIndex={activeKeyframeIndex}
            onSeek={seekTo}
            onStep={(d) => seekTo(videoTime() + d)}
            onDeleteKeyframe={handleDeleteKeyframe}
            onPreview={handlePreview}
            canTrack={editor.shapes.length > 0}
            isTracking={tracking}
            trackStatus={trackStatus}
            onTrack={handleTrack}
            onStopTrack={() => {
              if (trackJobRef.current) trackJobRef.current.cancelled = true;
            }}
          />,
          toolbarSlot
        )}
    </>
  );
}

function TextInputPopup({
  point,
  width,
  height,
  onConfirm,
  onCancel,
}: {
  point: Point;
  width: number;
  height: number;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="absolute z-30 flex gap-1" style={{ left: point.x * width, top: point.y * height }}>
      <input
        autoFocus
        className="input w-40"
        placeholder="Text..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirm(value);
          if (e.key === "Escape") onCancel();
        }}
      />
      <button className="btn-primary px-2" onClick={() => onConfirm(value)}>
        OK
      </button>
    </div>
  );
}
