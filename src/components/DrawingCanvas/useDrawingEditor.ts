import { useCallback, useRef, useState } from "react";
import { newId } from "@/lib/utils/id";
import { controlPoints, spotlightBeamHeightPx, translateShape } from "@/lib/drawing/shapeGeometry";
import type { Point, Shape, ShapeKind } from "@/types";

const MULTI_POINT_TOOLS: ShapeKind[] = ["polyline", "zone"];
const HANDLE_RADIUS_PX = 12;
const BODY_HIT_PX = 10;
const MIN_SIZE = 0.004;

type MoveState = { shapeId: string; handle: number | "all"; last: Point; before: Shape[]; moved: boolean };

function setControlPoint(shape: Shape, index: number, p: Point): Shape {
  const clamped = { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) };
  switch (shape.kind) {
    case "ellipse":
    case "spotlight":
      return { ...shape, center: clamped };
    case "text":
      return { ...shape, position: clamped };
    default: {
      const points = shape.points.map((q, i) => (i === index ? clamped : q));
      return { ...shape, points } as Shape;
    }
  }
}

function distToSegmentPx(p: Point, a: Point, b: Point, w: number, h: number) {
  const px = p.x * w, py = p.y * h;
  const ax = a.x * w, ay = a.y * h;
  const bx = b.x * w, by = b.y * h;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const f = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + f * dx), py - (ay + f * dy));
}

function pointInPolygon(p: Point, poly: Point[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function bodyHit(shape: Shape, p: Point, w: number, h: number) {
  const tol = BODY_HIT_PX + ((shape.strokeWidth / 400) * Math.min(w, h)) / 2;
  const segmentsHit = (pts: Point[], closed: boolean) => {
    for (let i = 0; i < pts.length - 1; i++) if (distToSegmentPx(p, pts[i], pts[i + 1], w, h) <= tol) return true;
    return closed && pts.length > 2 && distToSegmentPx(p, pts[pts.length - 1], pts[0], w, h) <= tol;
  };
  switch (shape.kind) {
    case "arrow":
    case "line":
    case "dashedLine":
    case "polyline":
      return segmentsHit(shape.points, false);
    case "zone":
      return pointInPolygon(p, shape.points) || segmentsHit(shape.points, true);
    case "ellipse":
    case "spotlight": {
      const rx = Math.max(4, shape.radiusX * w) + tol;
      const ry = Math.max(4, shape.radiusY * h) + tol;
      const nx = (p.x - shape.center.x) * w / rx;
      const ny = (p.y - shape.center.y) * h / ry;
      if (nx * nx + ny * ny <= 1) return true;
      if (shape.kind !== "spotlight") return false;
      const px = p.x * w, py = p.y * h;
      const cx = shape.center.x * w, cy = shape.center.y * h;
      return Math.abs(px - cx) <= rx && py <= cy && py >= cy - spotlightBeamHeightPx(shape, w);
    }
    case "text": {
      const fontPx = (shape.fontSize / 100) * h;
      const x = shape.position.x * w, y = shape.position.y * h;
      const px = p.x * w, py = p.y * h;
      return px >= x - tol && px <= x + shape.text.length * fontPx * 0.6 + tol && py >= y - tol && py <= y + fontPx + tol;
    }
  }
}

function isDegenerate(shape: Shape) {
  if (shape.kind === "ellipse" || shape.kind === "spotlight") return shape.radiusX < MIN_SIZE && shape.radiusY < MIN_SIZE;
  if (shape.kind === "arrow" || shape.kind === "line" || shape.kind === "dashedLine") {
    const [a, b] = shape.points;
    return Math.hypot(a.x - b.x, a.y - b.y) < MIN_SIZE;
  }
  return false;
}

/** onCommit sa volá pri každej zmene od užívateľa (nie pri load) — pohyblivé kresby z toho robia kľúčové body. */
export function useDrawingEditor(onCommit?: (shapes: Shape[]) => void) {
  const [shapes, setShapesState] = useState<Shape[]>([]);
  const shapesRef = useRef<Shape[]>([]);
  const [draft, setDraftState] = useState<Shape | null>(null);
  const draftRef = useRef<Shape | null>(null);
  const historyRef = useRef<Shape[][]>([]);
  const futureRef = useRef<Shape[][]>([]);
  const [, setHistoryTick] = useState(0);
  const draggingRef = useRef(false);
  const moveRef = useRef<MoveState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const setShapes = useCallback((s: Shape[]) => {
    shapesRef.current = s;
    setShapesState(s);
  }, []);
  const setDraft = useCallback((d: Shape | null) => {
    draftRef.current = d;
    setDraftState(d);
  }, []);
  const bump = useCallback(() => setHistoryTick((t) => t + 1), []);

  const commit = useCallback(
    (next: Shape[], before: Shape[] = shapesRef.current) => {
      historyRef.current.push(before);
      if (historyRef.current.length > 50) historyRef.current.shift();
      futureRef.current = [];
      setShapes(next);
      bump();
      onCommitRef.current?.(next);
    },
    [setShapes, bump]
  );

  const load = useCallback(
    (next: Shape[]) => {
      setShapes(next);
      historyRef.current = [];
      futureRef.current = [];
      setDraft(null);
      moveRef.current = null;
      bump();
    },
    [setShapes, setDraft, bump]
  );

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    futureRef.current.push(shapesRef.current);
    setShapes(prev);
    bump();
    onCommitRef.current?.(prev);
  }, [setShapes, bump]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(shapesRef.current);
    setShapes(next);
    bump();
    onCommitRef.current?.(next);
  }, [setShapes, bump]);

  const clearAll = useCallback(() => commit([]), [commit]);

  const removeShape = useCallback(
    (id: string) => {
      commit(shapesRef.current.filter((s) => s.id !== id));
      setSelectedId((sel) => (sel === id ? null : sel));
    },
    [commit]
  );

  const setSpotlightLabel = useCallback(
    (id: string, label: string) => {
      commit(shapesRef.current.map((s) => (s.id === id && s.kind === "spotlight" ? { ...s, label: label.trim() || undefined } : s)));
    },
    [commit]
  );

  // --- Kreslenie nových tvarov ---

  const startShape = useCallback(
    (tool: ShapeKind, point: Point, color: string, strokeWidth: number, label?: string) => {
      draggingRef.current = true;
      const base = { id: newId(), color, strokeWidth };
      switch (tool) {
        case "arrow":
        case "line":
        case "dashedLine":
          setDraft({ ...base, kind: tool, points: [point, point] });
          break;
        case "ellipse":
          setDraft({ ...base, kind: "ellipse", center: point, radiusX: 0.001, radiusY: 0.001 });
          break;
        case "spotlight":
          setDraft({ ...base, kind: "spotlight", center: point, radiusX: 0.001, radiusY: 0.001, label: label?.trim() || undefined });
          break;
        case "polyline":
        case "zone": {
          const prev = draftRef.current;
          if (prev && prev.kind === tool) {
            setDraft({ ...prev, points: [...prev.points, point] });
          } else if (tool === "zone") {
            setDraft({ ...base, kind: "zone", points: [point], fillOpacity: 0.25 });
          } else {
            setDraft({ ...base, kind: "polyline", points: [point] });
          }
          break;
        }
        case "text":
          break;
      }
    },
    [setDraft]
  );

  const updateShapeDrag = useCallback(
    (point: Point) => {
      const prev = draftRef.current;
      if (!draggingRef.current || !prev) return;
      if (prev.kind === "arrow" || prev.kind === "line" || prev.kind === "dashedLine") {
        setDraft({ ...prev, points: [prev.points[0], point] });
      } else if (prev.kind === "ellipse") {
        setDraft({ ...prev, radiusX: Math.abs(point.x - prev.center.x), radiusY: Math.abs(point.y - prev.center.y) });
      } else if (prev.kind === "spotlight") {
        // kruh na zemi je sploštený; pri ťahaní len do strany sa výška dopočíta (video ~16:9)
        const radiusX = Math.abs(point.x - prev.center.x);
        setDraft({ ...prev, radiusX, radiusY: Math.max(Math.abs(point.y - prev.center.y), radiusX * (16 / 9) * 0.35) });
      }
    },
    [setDraft]
  );

  const endDrag = useCallback(
    (tool: ShapeKind) => {
      draggingRef.current = false;
      if (MULTI_POINT_TOOLS.includes(tool) || tool === "text") return;
      const d = draftRef.current;
      setDraft(null);
      if (d && !isDegenerate(d)) {
        commit([...shapesRef.current, d]);
        setSelectedId(d.id);
      }
    },
    [commit, setDraft]
  );

  const finishMultiPoint = useCallback(() => {
    const d = draftRef.current;
    setDraft(null);
    if (d && (d.kind === "polyline" || d.kind === "zone") && d.points.length >= 2) {
      commit([...shapesRef.current, d]);
      setSelectedId(d.id);
    }
  }, [commit, setDraft]);

  const cancelDraft = useCallback(() => {
    draggingRef.current = false;
    setDraft(null);
  }, [setDraft]);

  const addText = useCallback(
    (position: Point, text: string, color: string, strokeWidth: number) => {
      if (!text.trim()) return;
      const shape: Shape = { id: newId(), kind: "text", color, strokeWidth, position, text: text.trim(), fontSize: 4.5 };
      commit([...shapesRef.current, shape]);
      setSelectedId(shape.id);
    },
    [commit]
  );

  // --- Presúvanie existujúcich tvarov ---

  const beginMove = useCallback((point: Point, w: number, h: number) => {
    const list = shapesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const shape = list[i];
      const handle = controlPoints(shape).findIndex(
        (cp) => Math.hypot((cp.x - point.x) * w, (cp.y - point.y) * h) <= HANDLE_RADIUS_PX
      );
      // kruh a text sa chytením za stred presúvajú celé
      const grabsWhole = shape.kind === "ellipse" || shape.kind === "spotlight" || shape.kind === "text";
      if (handle >= 0 || bodyHit(shape, point, w, h)) {
        moveRef.current = {
          shapeId: shape.id,
          handle: handle >= 0 && !grabsWhole ? handle : "all",
          last: point,
          before: list,
          moved: false,
        };
        setSelectedId(shape.id);
        return;
      }
    }
    setSelectedId(null);
  }, []);

  const updateMove = useCallback(
    (point: Point) => {
      const m = moveRef.current;
      if (!m) return;
      const dx = point.x - m.last.x;
      const dy = point.y - m.last.y;
      m.last = point;
      m.moved = true;
      setShapes(
        shapesRef.current.map((s) => {
          if (s.id !== m.shapeId) return s;
          return m.handle === "all" ? translateShape(s, dx, dy) : setControlPoint(s, m.handle, point);
        })
      );
    },
    [setShapes]
  );

  const endMove = useCallback(() => {
    const m = moveRef.current;
    moveRef.current = null;
    if (m?.moved) commit(shapesRef.current, m.before);
  }, [commit]);

  return {
    shapes,
    draft,
    selectedId,
    load,
    undo,
    redo,
    canUndo: historyRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    clearAll,
    removeShape,
    setSpotlightLabel,
    startShape,
    updateShapeDrag,
    endDrag,
    finishMultiPoint,
    cancelDraft,
    addText,
    beginMove,
    updateMove,
    endMove,
  };
}
