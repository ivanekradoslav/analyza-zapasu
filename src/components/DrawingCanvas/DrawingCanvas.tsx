import { useEffect, useRef } from "react";
import { drawShapesOnCanvas } from "@/lib/drawing/renderShapes";
import { controlPoints } from "@/lib/drawing/shapeGeometry";
import type { DrawTool, Point, Shape } from "@/types";

interface Props {
  width: number;
  height: number;
  shapes: Shape[];
  draft: Shape | null;
  editable: boolean;
  activeTool: DrawTool;
  selectedId?: string | null;
  onPointerDownPoint?: (p: Point) => void;
  onPointerMovePoint?: (p: Point) => void;
  onPointerUpPoint?: () => void;
  onDoubleClick?: () => void;
}

export default function DrawingCanvas({
  width,
  height,
  shapes,
  draft,
  editable,
  activeTool,
  selectedId,
  onPointerDownPoint,
  onPointerMovePoint,
  onPointerUpPoint,
  onDoubleClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showHandles = editable && activeTool === "move";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawShapesOnCanvas(ctx, draft ? [...shapes, draft] : shapes, width, height);

    if (showHandles) {
      for (const shape of shapes) {
        const selected = shape.id === selectedId;
        for (const p of controlPoints(shape)) {
          ctx.beginPath();
          ctx.arc(p.x * width, p.y * height, selected ? 7 : 5, 0, Math.PI * 2);
          ctx.fillStyle = selected ? "#facc15" : "rgba(255,255,255,0.9)";
          ctx.strokeStyle = "rgba(0,0,0,0.8)";
          ctx.lineWidth = 1.5;
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }, [shapes, draft, width, height, showHandles, selectedId]);

  function toNormalized(e: React.PointerEvent): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        cursor: !editable ? "default" : showHandles ? "move" : "crosshair",
        pointerEvents: editable ? "auto" : "none",
      }}
      className="absolute left-0 top-0"
      onPointerDown={
        editable
          ? (e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              onPointerDownPoint?.(toNormalized(e));
            }
          : undefined
      }
      onPointerMove={editable ? (e) => onPointerMovePoint?.(toNormalized(e)) : undefined}
      onPointerUp={editable ? () => onPointerUpPoint?.() : undefined}
      onDoubleClick={editable ? () => onDoubleClick?.() : undefined}
    />
  );
}
