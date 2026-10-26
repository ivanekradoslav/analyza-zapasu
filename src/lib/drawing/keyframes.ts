import type { Drawing, Keyframe, Point, Shape } from "@/types";

export const KEYFRAME_EPSILON = 0.05;

export function isTrackDrawing(d: Drawing): d is Drawing & { keyframes: Keyframe[] } {
  return d.mode === "track" && !!d.keyframes && d.keyframes.length > 0;
}

export function trackWindow(d: Drawing & { keyframes: Keyframe[] }) {
  const start = d.keyframes[0].time;
  const end = d.keyframes[d.keyframes.length - 1].time + d.durationSec;
  return { start, end };
}

function lerp(a: number, b: number, f: number) {
  return a + (b - a) * f;
}

function lerpPoint(a: Point, b: Point, f: number): Point {
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) };
}

function lerpPoints(a: Point[], b: Point[], f: number): Point[] {
  return a.map((p, i) => lerpPoint(p, b[i], f));
}

function lerpShape(a: Shape, b: Shape, f: number): Shape {
  switch (a.kind) {
    case "arrow":
    case "line":
    case "dashedLine":
      if (b.kind !== a.kind) return a;
      return { ...a, points: lerpPoints(a.points, b.points, f) as [Point, Point] };
    case "ellipse":
      if (b.kind !== "ellipse") return a;
      return {
        ...a,
        center: lerpPoint(a.center, b.center, f),
        radiusX: lerp(a.radiusX, b.radiusX, f),
        radiusY: lerp(a.radiusY, b.radiusY, f),
      };
    case "polyline":
    case "zone":
      if (b.kind !== a.kind || b.points.length !== a.points.length) return a;
      return { ...a, points: lerpPoints(a.points, b.points, f) } as Shape;
    case "text":
      if (b.kind !== "text") return a;
      return { ...a, position: lerpPoint(a.position, b.position, f) };
  }
}

/**
 * Tvary v čase t. Pred prvým kľúčovým bodom drží prvý, po poslednom drží posledný
 * (editor vďaka tomu vždy ukáže tvary, ktoré sa dajú posunúť na novú pozíciu).
 */
export function shapesAtTime(keyframes: Keyframe[], t: number): Shape[] {
  if (keyframes.length === 0) return [];
  if (t <= keyframes[0].time) return keyframes[0].shapes;
  const last = keyframes[keyframes.length - 1];
  if (t >= last.time) return last.shapes;

  let i = 0;
  while (i < keyframes.length - 1 && keyframes[i + 1].time < t) i++;
  const a = keyframes[i];
  const b = keyframes[i + 1];
  const f = (t - a.time) / (b.time - a.time);
  const bById = new Map(b.shapes.map((s) => [s.id, s]));
  return a.shapes.map((s) => {
    const target = bById.get(s.id);
    return target ? lerpShape(s, target, f) : s;
  });
}

/** Tvary všetkých pohyblivých kresieb, ktoré sú v čase t viditeľné. */
export function activeTrackShapes(drawings: Drawing[], t: number): Shape[] {
  const out: Shape[] = [];
  for (const d of drawings) {
    if (!isTrackDrawing(d)) continue;
    const { start, end } = trackWindow(d);
    if (t < start || t > end) continue;
    out.push(...shapesAtTime(d.keyframes, t));
  }
  return out;
}

export function upsertKeyframe(keyframes: Keyframe[], time: number, shapes: Shape[]): Keyframe[] {
  const rest = keyframes.filter((k) => Math.abs(k.time - time) > KEYFRAME_EPSILON);
  return [...rest, { time, shapes }].sort((a, b) => a.time - b.time);
}

export function removeKeyframeAt(keyframes: Keyframe[], time: number): Keyframe[] {
  return keyframes.filter((k) => Math.abs(k.time - time) > KEYFRAME_EPSILON);
}

/** Časový rozsah kresby (freeze aj track) — pre timeline a tvorbu klipu. */
export function drawingSpan(d: Drawing) {
  if (isTrackDrawing(d)) return trackWindow(d);
  return { start: d.timestamp, end: d.timestamp };
}
