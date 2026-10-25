import { useEffect, useState } from "react";
import { useDrawingEditor } from "@/components/DrawingCanvas/useDrawingEditor";
import DrawingCanvas from "@/components/DrawingCanvas/DrawingCanvas";
import DrawingToolbar from "@/components/DrawingCanvas/DrawingToolbar";
import { useAppStore } from "@/store/useAppStore";
import { getDrawingAtTimestamp, upsertDrawing, deleteDrawing } from "@/lib/db/operations";
import { newId } from "@/lib/utils/id";
import type { Drawing, Point } from "@/types";

interface Props {
  projectId: string;
  timestamp: number;
  width: number;
  height: number;
  onClose: () => void;
}

export default function DrawingEditOverlay({ projectId, timestamp, width, height, onClose }: Props) {
  const [existing, setExisting] = useState<Drawing | null | undefined>(undefined);
  const [durationSec, setDurationSec] = useState(4);
  const activeTool = useAppStore((s) => s.activeShapeTool);
  const setActiveTool = useAppStore((s) => s.setActiveShapeTool);
  const color = useAppStore((s) => s.activeDrawColor);
  const setColor = useAppStore((s) => s.setActiveDrawColor);
  const strokeWidth = useAppStore((s) => s.activeStrokeWidth);
  const setStrokeWidth = useAppStore((s) => s.setActiveStrokeWidth);

  const editor = useDrawingEditor([]);
  const [textPrompt, setTextPrompt] = useState<Point | null>(null);

  useEffect(() => {
    getDrawingAtTimestamp(projectId, timestamp).then((d) => {
      setExisting(d ?? null);
      if (d) {
        editor.load(d.shapes);
        setDurationSec(d.durationSec);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, timestamp]);

  function handlePointerDown(p: Point) {
    if (activeTool === "text") {
      setTextPrompt(p);
      return;
    }
    editor.startShape(activeTool, p, color, strokeWidth);
  }

  function handlePointerMove(p: Point) {
    editor.updateShapeDrag(p);
  }

  function handlePointerUp() {
    editor.endDrag(activeTool);
  }

  function handleDoubleClick() {
    if (activeTool === "polyline" || activeTool === "zone") {
      editor.finishMultiPoint();
    }
  }

  async function handleSave() {
    const drawing: Drawing = {
      id: existing?.id ?? newId(),
      projectId,
      timestamp,
      durationSec,
      shapes: editor.shapes,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    if (editor.shapes.length === 0 && existing) {
      await deleteDrawing(existing.id);
    } else if (editor.shapes.length > 0) {
      await upsertDrawing(drawing);
    }
    onClose();
  }

  if (existing === undefined) return null;

  return (
    <>
      <DrawingCanvas
        width={width}
        height={height}
        shapes={editor.shapes}
        draft={editor.draft}
        editable
        activeTool={activeTool}
        onPointerDownPoint={handlePointerDown}
        onPointerMovePoint={handlePointerMove}
        onPointerUpPoint={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      />
      {textPrompt && (
        <TextInputPopup
          point={textPrompt}
          width={width}
          height={height}
          onConfirm={(text) => {
            editor.startShape("text", textPrompt, color, strokeWidth);
            editor.finishText(text);
            setTextPrompt(null);
          }}
          onCancel={() => setTextPrompt(null)}
        />
      )}
      <DrawingToolbar
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
        onSave={handleSave}
        onCancel={onClose}
        hint={
          activeTool === "polyline" || activeTool === "zone"
            ? "Klikaním pridávaš body, dvojklikom dokončíš tvar"
            : activeTool === "text"
            ? "Klikni na miesto a napíš text"
            : "Ťahaním nakresli tvar"
        }
      />
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
    <div
      className="absolute z-30 flex gap-1"
      style={{ left: point.x * width, top: point.y * height }}
    >
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
