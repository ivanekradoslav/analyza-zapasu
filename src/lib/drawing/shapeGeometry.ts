import type { Point, Shape } from "@/types";

export function controlPoints(shape: Shape): Point[] {
  switch (shape.kind) {
    case "ellipse":
      return [shape.center];
    case "text":
      return [shape.position];
    default:
      return shape.points;
  }
}

export function translateShape(shape: Shape, dx: number, dy: number): Shape {
  const t = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
  switch (shape.kind) {
    case "ellipse":
      return { ...shape, center: t(shape.center) };
    case "text":
      return { ...shape, position: t(shape.position) };
    default:
      return { ...shape, points: shape.points.map(t) } as Shape;
  }
}

/** Bod, ktorý sa pri sledovaní hráča drží na hráčovi (stred kruhu, inak ťažisko bodov). */
export function shapeAnchor(shape: Shape): Point {
  const pts = controlPoints(shape);
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}
