import { useCallback, useRef, useState } from "react";
import { newId } from "@/lib/utils/id";
import type { Point, Shape, ShapeKind } from "@/types";

const MULTI_POINT_TOOLS: ShapeKind[] = ["polyline", "zone"];

export function useDrawingEditor(initial: Shape[] = []) {
  const [shapes, setShapes] = useState<Shape[]>(initial);
  const historyRef = useRef<Shape[][]>([]);
  const futureRef = useRef<Shape[][]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const draggingRef = useRef(false);
  const [historyTick, setHistoryTick] = useState(0);

  const pushHistory = useCallback((prev: Shape[]) => {
    historyRef.current.push(prev);
    if (historyRef.current.length > 50) historyRef.current.shift();
    futureRef.current = [];
    setHistoryTick((t) => t + 1);
  }, []);

  const commit = useCallback(
    (next: Shape[]) => {
      pushHistory(shapes);
      setShapes(next);
    },
    [shapes, pushHistory]
  );

  const load = useCallback((next: Shape[]) => {
    setShapes(next);
    historyRef.current = [];
    futureRef.current = [];
    setDraft(null);
    setHistoryTick((t) => t + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    futureRef.current.push(shapes);
    setShapes(prev);
    setHistoryTick((t) => t + 1);
  }, [shapes]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(shapes);
    setShapes(next);
    setHistoryTick((t) => t + 1);
  }, [shapes]);

  const clearAll = useCallback(() => commit([]), [commit]);

  const removeShape = useCallback(
    (id: string) => commit(shapes.filter((s) => s.id !== id)),
    [shapes, commit]
  );

  // --- Interakcia kreslenia ---

  const startShape = useCallback(
    (tool: ShapeKind, point: Point, color: string, strokeWidth: number) => {
      draggingRef.current = true;
      const base = { id: newId(), color, strokeWidth };
      switch (tool) {
        case "arrow":
        case "line":
        case "dashedLine":
          setDraft({ ...base, kind: tool, points: [point, point] } as Shape);
          break;
        case "ellipse":
          setDraft({ ...base, kind: "ellipse", center: point, radiusX: 0.001, radiusY: 0.001 } as Shape);
          break;
        case "polyline":
        case "zone":
          setDraft((prev) => {
            if (prev && prev.kind === tool) {
              return { ...prev, points: [...(prev as any).points, point] } as Shape;
            }
            return { ...base, kind: tool, points: [point], ...(tool === "zone" ? { fillOpacity: 0.25 } : {}) } as Shape;
          });
          break;
        case "text":
          setDraft({ ...base, kind: "text", position: point, text: "", fontSize: 4.5 } as Shape);
          break;
      }
    },
    []
  );

  const updateShapeDrag = useCallback((point: Point) => {
    if (!draggingRef.current) return;
    setDraft((prev) => {
      if (!prev) return prev;
      if (prev.kind === "arrow" || prev.kind === "line" || prev.kind === "dashedLine") {
        return { ...prev, points: [prev.points[0], point] } as Shape;
      }
      if (prev.kind === "ellipse") {
        return {
          ...prev,
          radiusX: Math.abs(point.x - prev.center.x),
          radiusY: Math.abs(point.y - prev.center.y),
        } as Shape;
      }
      return prev;
    });
  }, []);

  const endDrag = useCallback(
    (tool: ShapeKind) => {
      draggingRef.current = false;
      if (MULTI_POINT_TOOLS.includes(tool) || tool === "text") return; // tieto sa ukončujú inak
      setDraft((prev) => {
        if (!prev) return prev;
        commit([...shapes, prev]);
        return null;
      });
    },
    [shapes, commit]
  );

  const finishMultiPoint = useCallback(() => {
    setDraft((prev) => {
      if (!prev) return prev;
      const pts = (prev as any).points as Point[] | undefined;
      if (pts && pts.length >= 2) {
        commit([...shapes, prev]);
      }
      return null;
    });
  }, [shapes, commit]);

  const cancelDraft = useCallback(() => {
    draggingRef.current = false;
    setDraft(null);
  }, []);

  const finishText = useCallback(
    (text: string) => {
      setDraft((prev) => {
        if (!prev || prev.kind !== "text") return null;
        if (text.trim()) {
          commit([...shapes, { ...prev, text: text.trim() }]);
        }
        return null;
      });
    },
    [shapes, commit]
  );

  return {
    shapes,
    draft,
    load,
    undo,
    redo,
    canUndo: historyTick >= 0 && historyRef.current.length > 0,
    canRedo: historyTick >= 0 && futureRef.current.length > 0,
    clearAll,
    removeShape,
    startShape,
    updateShapeDrag,
    endDrag,
    finishMultiPoint,
    cancelDraft,
    finishText,
  };
}
