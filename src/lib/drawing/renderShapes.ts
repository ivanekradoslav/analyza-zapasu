import { spotlightBeamHeightPx } from "@/lib/drawing/shapeGeometry";
import { formatMeters, makeProjection, pitchDistance, type PitchProjection } from "@/lib/drawing/pitch";
import type { PitchCalibration, Point, Shape, SpotlightShape } from "@/types";

function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Svetelný kužeľ zhora: úzky vysoko nad hráčom, k zemi sa rozširuje a pri nohách svieti na trávu; štítok pod ním. */
function drawSpotlight(ctx: CanvasRenderingContext2D, shape: SpotlightShape, width: number, height: number) {
  const cx = shape.center.x * width;
  const cy = shape.center.y * height;
  const rx = Math.max(3, shape.radiusX * width);
  const ry = Math.max(2, shape.radiusY * height);
  const topY = cy - spotlightBeamHeightPx(shape, width);
  const topHalf = rx * 0.18;

  ctx.save();
  ctx.filter = `blur(${Math.max(1.5, rx * 0.12)}px)`;

  // kužeľ: z výšky (slabý) k zemi (najsilnejší)
  const cone = ctx.createLinearGradient(0, topY, 0, cy);
  cone.addColorStop(0, withAlpha(shape.color, 0));
  cone.addColorStop(0.3, withAlpha(shape.color, 0.14));
  cone.addColorStop(0.75, withAlpha(shape.color, 0.3));
  cone.addColorStop(1, withAlpha(shape.color, 0.45));
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(cx - topHalf, topY);
  ctx.lineTo(cx + topHalf, topY);
  ctx.lineTo(cx + rx, cy);
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fill();

  // svetlo dopadajúce na trávu (bez obrysu)
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 1.15);
  pool.addColorStop(0, withAlpha(shape.color, 0.55));
  pool.addColorStop(0.7, withAlpha(shape.color, 0.3));
  pool.addColorStop(1, withAlpha(shape.color, 0));
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(0, 0, rx * 1.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (shape.label) {
    const fontPx = Math.min(height * 0.026, Math.max(10, rx * 0.4));
    ctx.font = `700 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
    const textW = ctx.measureText(shape.label).width;
    const padX = fontPx * 0.5, padY = fontPx * 0.3;
    const boxW = textW + padX * 2, boxH = fontPx + padY * 2;
    const bx = cx - boxW / 2, by = cy + ry + fontPx * 0.35;
    ctx.fillStyle = "rgba(15, 23, 20, 0.85)";
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, boxH / 2.5);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(shape.label, cx, by + boxH / 2);
  }
}

const projectionCache = new WeakMap<PitchCalibration, PitchProjection | null>();
function projectionFor(c: PitchCalibration | null | undefined) {
  if (!c) return null;
  if (!projectionCache.has(c)) projectionCache.set(c, makeProjection(c));
  return projectionCache.get(c) ?? null;
}

// Vykreslí zoznam tvarov (normalizované súradnice 0..1) na canvas danej
// pixelovej veľkosti. Používa sa pri živom prekrytí videa aj pri generovaní
// PNG prekrytia pre export (musí byť 1:1 rovnaký výsledok).
// calibration = perspektíva ihriska kresby; tvary s ground sa bez nej kreslia ploché.
export function drawShapesOnCanvas(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  width: number,
  height: number,
  calibration?: PitchCalibration | null,
  // elapsedSec = čas od zobrazenia kresby (animácia presunu hráča); bez neho sa kreslí konečný stav
  options: { clear?: boolean; elapsedSec?: number } = {}
) {
  if (options.clear !== false) ctx.clearRect(0, 0, width, height);
  const refUnit = Math.min(width, height);
  const proj = projectionFor(calibration);

  for (const shape of shapes) {
    ctx.save();
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
    ctx.lineWidth = (shape.strokeWidth / 400) * refUnit;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (shape.kind === "movePlayer") {
      drawMovePlayer(ctx, shape.points, shape.ground ? proj : null, width, height, options.elapsedSec);
      ctx.restore();
      continue;
    }

    const onGround = !!proj && (!!shape.ground || shape.kind === "offsideLine") && drawGroundShape(ctx, shape, proj, width, height);
    const distances = () => {
      if (proj && shape.kind === "polyline" && shape.showDistances) drawSegmentDistances(ctx, shape.points, proj, width, height);
    };
    if (onGround) {
      distances();
      ctx.restore();
      continue;
    }

    switch (shape.kind) {
      case "arrow": {
        const [p1, p2] = shape.points;
        const x1 = p1.x * width, y1 = p1.y * height;
        const x2 = p2.x * width, y2 = p2.y * height;
        drawArrow(ctx, x1, y1, x2, y2, ctx.lineWidth);
        break;
      }
      case "line":
      case "dashedLine": {
        const [p1, p2] = shape.points;
        ctx.setLineDash(shape.kind === "dashedLine" ? [ctx.lineWidth * 2.2, ctx.lineWidth * 1.6] : []);
        ctx.beginPath();
        ctx.moveTo(p1.x * width, p1.y * height);
        ctx.lineTo(p2.x * width, p2.y * height);
        ctx.stroke();
        break;
      }
      case "ellipse": {
        ctx.beginPath();
        ctx.ellipse(
          shape.center.x * width,
          shape.center.y * height,
          Math.max(2, shape.radiusX * width),
          Math.max(2, shape.radiusY * height),
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        break;
      }
      case "polyline": {
        if (shape.points.length < 2) break;
        ctx.beginPath();
        shape.points.forEach((p, i) => {
          const x = p.x * width, y = p.y * height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        // body na spojnici
        for (const p of shape.points) {
          ctx.beginPath();
          ctx.arc(p.x * width, p.y * height, ctx.lineWidth * 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "zone": {
        if (shape.points.length < 2) break;
        ctx.beginPath();
        shape.points.forEach((p, i) => {
          const x = p.x * width, y = p.y * height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.globalAlpha = shape.fillOpacity;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.stroke();
        break;
      }
      case "spotlight":
        drawSpotlight(ctx, shape, width, height);
        break;
      case "offsideLine": {
        // bez perspektívy: vodorovná čiara cez celý obraz
        const y = shape.points[0].y * height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        break;
      }
      case "measure":
        drawMeasure(ctx, shape.points, width, height, proj ? pitchDistance(proj, shape.points[0], shape.points[1]) : null);
        break;
      case "text": {
        const fontPx = (shape.fontSize / 100) * height;
        ctx.font = `700 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textBaseline = "top";
        const x = shape.position.x * width;
        const y = shape.position.y * height;
        // tenký obrys pre čitateľnosť na zelenom trávniku
        ctx.lineWidth = Math.max(2, fontPx * 0.08);
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.strokeText(shape.text, x, y);
        ctx.fillText(shape.text, x, y);
        break;
      }
    }
    distances();
    ctx.restore();
  }
}

// ---------- Presun hráča a vzdialenosti v línii ----------

/** Ako dlho sa „duch“ hráča presúva na cieľové miesto, keď sa kresba objaví. */
export const MOVE_PLAYER_ANIM_SEC = 1.4;

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, h: number) {
  const fontPx = Math.max(11, h * 0.024);
  ctx.save();
  ctx.font = "700 " + fontPx + "px ui-sans-serif, system-ui, sans-serif";
  const bw = ctx.measureText(text).width + fontPx * 0.8;
  const bh = fontPx * 1.4;
  ctx.fillStyle = "rgba(15, 23, 20, 0.85)";
  ctx.beginPath();
  ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, bh / 2.5);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawSegmentDistances(ctx: CanvasRenderingContext2D, pts: Point[], proj: PitchProjection, w: number, h: number) {
  for (let i = 0; i < pts.length - 1; i++) {
    const m = pitchDistance(proj, pts[i], pts[i + 1]);
    if (m === null) continue;
    const x = ((pts[i].x + pts[i + 1].x) / 2) * w;
    const y = ((pts[i].y + pts[i + 1].y) / 2) * h;
    label(ctx, formatMeters(m), x, y - Math.max(10, h * 0.022), h);
  }
}

/**
 * Presun hráča: plný krúžok tam, kde hráč je, prerušovaná dráha a „duch“ (prerušovaný krúžok
 * so šípkou) tam, kde mal byť. Pri animácii sa duch presúva po dráhe.
 */
function drawMovePlayer(
  ctx: CanvasRenderingContext2D,
  pts: [Point, Point],
  proj: PitchProjection | null,
  w: number,
  h: number,
  elapsedSec?: number
) {
  const f = elapsedSec === undefined ? 1 : easeInOut(Math.min(1, Math.max(0, elapsedSec / MOVE_PLAYER_ANIM_SEC)));
  const lw = ctx.lineWidth;
  const a = pts[0], b = pts[1];
  const ghost = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };

  // krúžok hráča (na tráve v perspektíve, inak plochá elipsa)
  const ring = (p: Point, dashed: boolean, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.setLineDash(dashed ? [lw * 1.6, lw * 1.2] : []);
    const c = proj?.toPitch(p);
    const poly = c ? polyPx(proj!, circleOnPitch(c, 0.9, 40), w, h) : null;
    if (poly) {
      pathPoly(ctx, poly);
    } else {
      ctx.beginPath();
      ctx.ellipse(p.x * w, p.y * h, Math.max(8, w * 0.016), Math.max(4, w * 0.016 * 0.4), 0, 0, Math.PI * 2);
    }
    ctx.save();
    ctx.globalAlpha = alpha * 0.22;
    ctx.fill();
    ctx.restore();
    ctx.stroke();
    ctx.restore();
  };

  // dráha: celá slabo, prejdená časť naplno
  const path = (from: Point, to: Point, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.setLineDash([lw * 2.2, lw * 1.6]);
    ctx.beginPath();
    ctx.moveTo(from.x * w, from.y * h);
    ctx.lineTo(to.x * w, to.y * h);
    ctx.stroke();
    ctx.restore();
  };
  path(a, b, 0.35);
  path(a, ghost, 1);
  ring(a, false, 1);
  if (f > 0.02) {
    ring(ghost, true, 1);
    // malá šípka pri duchovi v smere pohybu
    const ang = Math.atan2((b.y - a.y) * h, (b.x - a.x) * w);
    const gx = ghost.x * w, gy = ghost.y * h;
    const head = Math.max(8, lw * 3.2);
    ctx.beginPath();
    ctx.moveTo(gx + Math.cos(ang) * head, gy + Math.sin(ang) * head);
    ctx.lineTo(gx + Math.cos(ang + 2.5) * head * 0.8, gy + Math.sin(ang + 2.5) * head * 0.8);
    ctx.lineTo(gx + Math.cos(ang - 2.5) * head * 0.8, gy + Math.sin(ang - 2.5) * head * 0.8);
    ctx.closePath();
    ctx.fill();
  }
  // pri nastavenom ihrisku: koľko metrov mal hráč prebehnúť
  if (proj && f >= 1) {
    const m = pitchDistance(proj, a, b);
    if (m !== null) label(ctx, formatMeters(m), ((a.x + b.x) / 2) * w, ((a.y + b.y) / 2) * h - Math.max(10, h * 0.022), h);
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, lineWidth: number) {
  const headLen = Math.max(10, lineWidth * 4);
  const angle = Math.atan2(y2 - y1, x2 - x1);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

// ---------- Tvary „na tráve“ (perspektíva ihriska) ----------

type Px = { x: number; y: number };

/** Body na ihrisku (metre) → pixely; null, ak niektorý bod nejde zobraziť (za horizontom). */
function polyPx(proj: PitchProjection, pts: Point[], w: number, h: number): Px[] | null {
  const out: Px[] = [];
  for (const p of pts) {
    const q = proj.toImage(p);
    if (!q) return null;
    out.push({ x: q.x * w, y: q.y * h });
  }
  return out;
}

function pathPoly(ctx: CanvasRenderingContext2D, pts: Px[], close = true) {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  if (close) ctx.closePath();
}

function circleOnPitch(center: Point, r: number, n = 56): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
  });
}

/** Pás na tráve z bodu a do b s polovičnou šírkou hw (metre). */
function stripOnPitch(a: Point, b: Point, hw: number): Point[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = (-(b.y - a.y) / len) * hw;
  const ny = ((b.x - a.x) / len) * hw;
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
}

/** Polovičná šírka čiary na tráve v metroch podľa hrúbky (1–8). */
export function groundHalfWidth(strokeWidth: number) {
  return 0.07 + strokeWidth * 0.045;
}

function fillWithOutline(ctx: CanvasRenderingContext2D, pts: Px[]) {
  pathPoly(ctx, pts);
  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.stroke();
  ctx.restore();
  ctx.fill();
}

function drawGroundShape(ctx: CanvasRenderingContext2D, shape: Shape, proj: PitchProjection, w: number, h: number): boolean {
  switch (shape.kind) {
    case "ellipse": {
      const c = proj.toPitch(shape.center);
      const ring = c && polyPx(proj, circleOnPitch(c, shape.radiusM ?? 1), w, h);
      if (!ring) return false;
      ctx.save();
      ctx.globalAlpha = 0.18;
      pathPoly(ctx, ring);
      ctx.fill();
      ctx.restore();
      pathPoly(ctx, ring);
      ctx.stroke();
      return true;
    }
    case "spotlight": {
      const c = proj.toPitch(shape.center);
      const ring = c && polyPx(proj, circleOnPitch(c, shape.radiusM ?? 1.2), w, h);
      if (!ring) return false;
      const xs = ring.map((p) => p.x);
      const ys = ring.map((p) => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      drawSpotlight(
        ctx,
        {
          ...shape,
          center: { x: (minX + maxX) / 2 / w, y: (minY + maxY) / 2 / h },
          radiusX: (maxX - minX) / 2 / w,
          radiusY: (maxY - minY) / 2 / h,
        },
        w,
        h
      );
      return true;
    }
    case "arrow":
    case "line":
    case "dashedLine": {
      const a = proj.toPitch(shape.points[0]);
      const b = proj.toPitch(shape.points[1]);
      if (!a || !b) return false;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.05) return true;
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      const hw = groundHalfWidth(shape.strokeWidth);

      if (shape.kind === "dashedLine") {
        const dash = 1.1, gap = 0.75;
        for (let d = 0; d < len; d += dash + gap) {
          const e = Math.min(len, d + dash);
          const q = polyPx(proj, stripOnPitch({ x: a.x + ux * d, y: a.y + uy * d }, { x: a.x + ux * e, y: a.y + uy * e }, hw), w, h);
          if (q) fillWithOutline(ctx, q);
        }
        return true;
      }
      const headLen = shape.kind === "arrow" ? Math.min(len * 0.45, 0.9 + hw * 6) : 0;
      const shaftEnd = { x: b.x - ux * headLen, y: b.y - uy * headLen };
      const shaft = polyPx(proj, stripOnPitch(a, shaftEnd, hw), w, h);
      if (shaft) fillWithOutline(ctx, shaft);
      if (shape.kind === "arrow") {
        const hh = hw * 3.2;
        const head = polyPx(
          proj,
          [{ x: shaftEnd.x - uy * hh, y: shaftEnd.y + ux * hh }, b, { x: shaftEnd.x + uy * hh, y: shaftEnd.y - ux * hh }],
          w,
          h
        );
        if (head) fillWithOutline(ctx, head);
      }
      return true;
    }
    case "polyline": {
      if (shape.points.length < 2) return true;
      pathPoly(ctx, shape.points.map((p) => ({ x: p.x * w, y: p.y * h })), false);
      ctx.stroke();
      // krúžky na tráve okolo hráčov v línii
      for (const p of shape.points) {
        const c = proj.toPitch(p);
        const ring = c && polyPx(proj, circleOnPitch(c, 0.8, 36), w, h);
        if (!ring) continue;
        ctx.save();
        ctx.globalAlpha = 0.25;
        pathPoly(ctx, ring);
        ctx.fill();
        ctx.restore();
        pathPoly(ctx, ring);
        ctx.stroke();
      }
      return true;
    }
    case "zone": {
      // formačná zóna: šrafovaná výplň a krúžky na tráve v rohoch (pri hráčoch)
      if (shape.points.length < 3) return false;
      const pts = shape.points.map((p) => ({ x: p.x * w, y: p.y * h }));
      ctx.save();
      pathPoly(ctx, pts);
      ctx.globalAlpha = shape.fillOpacity * 0.8;
      ctx.fill();
      ctx.clip();
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = Math.max(1.5, ctx.lineWidth * 0.6);
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const step = Math.max(8, h * 0.018);
      ctx.beginPath();
      for (let x = minX - (maxY - minY); x < maxX; x += step) {
        ctx.moveTo(x, maxY);
        ctx.lineTo(x + (maxY - minY), minY);
      }
      ctx.stroke();
      ctx.restore();
      pathPoly(ctx, pts);
      ctx.stroke();
      for (const p of shape.points) {
        const c = proj.toPitch(p);
        const ring = c && polyPx(proj, circleOnPitch(c, 0.8, 36), w, h);
        if (!ring) continue;
        pathPoly(ctx, ring);
        ctx.stroke();
      }
      return true;
    }
    case "offsideLine": {
      const a = proj.toPitch(shape.points[0]);
      if (!a) return false;
      const hw = groundHalfWidth(shape.strokeWidth) * 0.8;
      const cw = proj.calibration.widthM;
      // úseky po 4 m cez celú šírku ihriska; tie za horizontom sa vynechajú
      ctx.save();
      ctx.shadowColor = shape.color;
      ctx.shadowBlur = 8;
      for (let x = -cw * 2; x < cw * 3; x += 4) {
        const q = polyPx(proj, stripOnPitch({ x, y: a.y }, { x: x + 4.05, y: a.y }, hw), w, h);
        if (!q) continue;
        pathPoly(ctx, q);
        ctx.fill();
      }
      ctx.restore();
      return true;
    }
    default:
      return false;
  }
}

function drawMeasure(ctx: CanvasRenderingContext2D, pts: [Point, Point], w: number, h: number, meters: number | null) {
  const a = { x: pts[0].x * w, y: pts[0].y * h };
  const b = { x: pts[1].x * w, y: pts[1].y * h };
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = (-(b.y - a.y) / len) * 7;
  const ny = ((b.x - a.x) / len) * 7;
  ctx.setLineDash([ctx.lineWidth * 2.5, ctx.lineWidth * 1.5]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const p of [a, b]) {
    ctx.beginPath();
    ctx.moveTo(p.x - nx, p.y - ny);
    ctx.lineTo(p.x + nx, p.y + ny);
    ctx.stroke();
  }
  const text = meters === null ? "? m" : formatMeters(meters);
  const fontPx = Math.max(12, h * 0.03);
  ctx.font = "700 " + fontPx + "px ui-sans-serif, system-ui, sans-serif";
  const tw = ctx.measureText(text).width;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const bw = tw + fontPx * 0.9;
  const bh = fontPx * 1.5;
  ctx.fillStyle = "rgba(15, 23, 20, 0.85)";
  ctx.beginPath();
  ctx.roundRect(mx - bw / 2, my - bh - 6, bw, bh, bh / 2.5);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, mx, my - bh / 2 - 6);
}
