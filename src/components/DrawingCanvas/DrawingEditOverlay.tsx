import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import { playerLabel } from "@/lib/utils/players";
import { useDrawingEditor } from "@/components/DrawingCanvas/useDrawingEditor";
import DrawingCanvas from "@/components/DrawingCanvas/DrawingCanvas";
import DrawingToolbar from "@/components/DrawingCanvas/DrawingToolbar";
import { useAppStore } from "@/store/useAppStore";
import { findDrawingForEdit, upsertDrawing, deleteDrawing } from "@/lib/db/operations";
import { isTrackDrawing, KEYFRAME_EPSILON, removeKeyframeAt, shapesAtTime, upsertKeyframe } from "@/lib/drawing/keyframes";
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

  const players = useLiveQuery(() => db.players.where("projectId").equals(projectId).sortBy("order"), [projectId], []);
  const [labelDraft, setLabelDraft] = useState("");
  const selectedSpotlight = editor.shapes.find((s) => s.id === editor.selectedId && s.kind === "spotlight");
  const selectedSpotlightId = selectedSpotlight?.id;
  const selectedSpotlightLabel = selectedSpotlight?.kind === "spotlight" ? selectedSpotlight.label ?? "" : "";
  useEffect(() => {
    if (selectedSpotlightId) setLabelDraft(selectedSpotlightLabel);
    // len pri zmene výberu, nie pri každej zmene štítku
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpotlightId]);

  /** Štítok platí pre svetlo v celej pohyblivej kresbe, nie len od aktuálneho kľúčového bodu. */
  function applyLabel(text: string) {
    setLabelDraft(text);
    if (!selectedSpotlightId) return;
    if (modeRef.current !== "track") {
      editor.setSpotlightLabel(selectedSpotlightId, text);
      return;
    }
    const label = text.trim() || undefined;
    const next = updateKeyframes((k) =>
      k.map((kf) => ({
        ...kf,
        shapes: kf.shapes.map((s) => (s.id === selectedSpotlightId && s.kind === "spotlight" ? { ...s, label } : s)),
      }))
    );
    load(next.length > 0 ? shapesAtTime(next, videoTime()) : editor.shapes);
  }

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
      editor.startShape(activeTool, p, color, strokeWidth, activeTool === "spotlight" ? labelDraft : undefined);
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
  } else if (activeTool === "spotlight") {
    hint = "Ťahaj od nôh hráča do strany — veľkosť kruhu určí aj výšku svetla. Štítok vyber nižšie.";
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
            labelEditor={
              selectedSpotlightId ? { forSelected: true } : activeTool === "spotlight" ? { forSelected: false } : null
            }
            labelDraft={labelDraft}
            onLabelDraftChange={setLabelDraft}
            onLabelCommit={() => selectedSpotlightId && selectedSpotlightLabel !== labelDraft && applyLabel(labelDraft)}
            players={players ?? []}
            onPickPlayer={(id) => {
              const p = players?.find((x) => x.id === id);
              if (p) applyLabel(playerLabel(p));
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
