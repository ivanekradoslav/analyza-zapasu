import { useEffect, useRef } from "react";
import { drawShapesOnCanvas } from "@/lib/drawing/renderShapes";
import type { Point, Shape, ShapeKind } from "@/types";

interface Props {
  width: number;
  height: number;
  shapes: Shape[];
  draft: Shape | null;
  editable: boolean;
  activeTool: ShapeKind;
  onPointerDownPoint?: (p: Point) => void;
  onPointerMovePoint?: (p: Point) => void;
  onPointerUpPoint?: () => void;
  onDoubleClick?: () => void;
  pendingTextPoint?: Point | null;
}

export default function DrawingCanvas({
  width,
  height,
  shapes,
  draft,
  editable,
  activeTool,
  onPointerDownPoint,
  onPointerMovePoint,
  onPointerUpPoint,
  onDoubleClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const toRender = draft ? [...shapes, draft] : shapes;
    drawShapesOnCanvas(ctx, toRender, width, height);
  }, [shapes, draft, width, height]);

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
      style={{ width, height, cursor: editable ? "crosshair" : "default", pointerEvents: editable ? "auto" : "none" }}
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
      data-tool={activeTool}
      data-editable={editable}
    />
  );
}
