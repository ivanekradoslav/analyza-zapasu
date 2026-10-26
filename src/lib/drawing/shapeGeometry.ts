import type { Point, Shape, SpotlightShape } from "@/types";

// Výška svetelného kužeľa (odkiaľ svieti) ako násobok polomeru svetla pri nohách – vysoko nad hráčom.
const SPOTLIGHT_BEAM_RATIO = 7;

export function spotlightBeamHeightPx(shape: SpotlightShape, width: number) {
  return shape.radiusX * width * SPOTLIGHT_BEAM_RATIO;
}

export function controlPoints(shape: Shape): Point[] {
  switch (shape.kind) {
    case "ellipse":
    case "spotlight":
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
    case "spotlight":
      return { ...shape, center: t(shape.center) };
    case "text":
      return { ...shape, position: t(shape.position) };
    default:
      return { ...shape, points: shape.points.map(t) } as Shape;
  }
}
