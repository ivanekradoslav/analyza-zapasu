import { shapeAnchor } from "@/lib/drawing/shapeGeometry";
import type { Keyframe, Point, Shape } from "@/types";

// Sledovanie hráča porovnávaním výrezu obrazu (normalizovaná krížová korelácia na RGB).
// Žiadny ML model: výrez okolo označeného hráča sa v každom kroku hľadá v okolí predpokladanej polohy.

const PROC_MAX_WIDTH = 960;
const SEARCH_RADIUS_PX = 40; // pri šírke 960 px; Veo kamera sa medzi krokmi aj otáča
const LOST_SCORE = 0.35;
const ADAPT_SCORE = 0.55;
const ADAPT_WEIGHT = 0.4;

interface Template {
  w: number;
  h: number;
  ox: number; // poloha kotviaceho bodu (hráča) vo výreze
  oy: number;
  vals: Float32Array; // RGB, odčítaný priemer
  norm: number;
}

function normalize(vals: Float32Array) {
  let sum = 0;
  for (let i = 0; i < vals.length; i++) sum += vals[i];
  const mean = sum / vals.length;
  let sq = 0;
  for (let i = 0; i < vals.length; i++) {
    vals[i] -= mean;
    sq += vals[i] * vals[i];
  }
  return Math.sqrt(sq);
}

function seekVideo(video: HTMLVideoElement, t: number) {
  return new Promise<void>((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 3000);
    video.addEventListener("seeked", done);
    video.currentTime = t;
  });
}

export interface TrackResult {
  anchor: Point;
  score: number;
}

export class PlayerTracker {
  private readonly w: number;
  private readonly h: number;
  private readonly ctx: OffscreenCanvasRenderingContext2D;
  private base!: Template;
  private tpl!: Template;
  private pos = { x: 0, y: 0 };
  private vel = { x: 0, y: 0 };

  constructor(private readonly video: HTMLVideoElement) {
    this.w = Math.min(PROC_MAX_WIDTH, video.videoWidth);
    this.h = Math.round((this.w * video.videoHeight) / video.videoWidth);
    this.ctx = new OffscreenCanvas(this.w, this.h).getContext("2d", { willReadFrequently: true })!;
  }

  private grab() {
    this.ctx.drawImage(this.video, 0, 0, this.w, this.h);
    return this.ctx.getImageData(0, 0, this.w, this.h).data;
  }

  private extract(frame: Uint8ClampedArray, ax: number, ay: number, w: number, h: number, ox: number, oy: number): Template {
    const vals = new Float32Array(w * h * 3);
    let i = 0;
    for (let y = 0; y < h; y++) {
      const fy = Math.min(this.h - 1, Math.max(0, Math.round(ay - oy + y)));
      for (let x = 0; x < w; x++) {
        const fx = Math.min(this.w - 1, Math.max(0, Math.round(ax - ox + x)));
        const p = (fy * this.w + fx) * 4;
        vals[i++] = frame[p];
        vals[i++] = frame[p + 1];
        vals[i++] = frame[p + 2];
      }
    }
    return { w, h, ox, oy, vals, norm: normalize(vals) };
  }

  /** Šírka výrezu podľa veľkosti kruhu; výrez siaha viac nahor (kruh býva pod hráčom). */
  start(shape: Shape) {
    const anchor = shapeAnchor(shape);
    const scale = this.w / PROC_MAX_WIDTH;
    let w = Math.round(28 * scale);
    let h = Math.round(48 * scale);
    if (shape.kind === "ellipse") {
      w = Math.round(Math.min(90, Math.max(14, 2.2 * shape.radiusX * this.w)));
      h = Math.round(Math.min(150, Math.max(20, 2.2 * shape.radiusY * this.h, 1.8 * w)));
    }
    this.pos = { x: anchor.x * this.w, y: anchor.y * this.h };
    this.vel = { x: 0, y: 0 };
    this.base = this.extract(this.grab(), this.pos.x, this.pos.y, w, h, Math.floor(w / 2), Math.floor(h * 0.75));
    this.tpl = this.base;
  }

  private score(frame: Uint8ClampedArray, ax: number, ay: number) {
    const { w, h, ox, oy, vals, norm } = this.tpl;
    const left = ax - ox;
    const top = ay - oy;
    let sP = 0, sP2 = 0, sPT = 0, i = 0;
    for (let y = 0; y < h; y++) {
      let p = ((top + y) * this.w + left) * 4;
      for (let x = 0; x < w; x++, p += 4) {
        for (let c = 0; c < 3; c++) {
          const v = frame[p + c];
          sP += v;
          sP2 += v * v;
          sPT += v * vals[i++];
        }
      }
    }
    const n = w * h * 3;
    const varP = sP2 - (sP * sP) / n;
    return varP <= 1e-6 || norm <= 1e-6 ? 0 : sPT / (Math.sqrt(varP) * norm);
  }

  /** Posunie video na čas t a nájde hráča. null = hráč stratený (malá zhoda). */
  async step(t: number): Promise<TrackResult | null> {
    await seekVideo(this.video, t);
    const frame = this.grab();
    const { w, h, ox, oy } = this.tpl;
    const minX = ox, maxX = this.w - (w - ox);
    const minY = oy, maxY = this.h - (h - oy);
    const radius = Math.round(SEARCH_RADIUS_PX * (this.w / PROC_MAX_WIDTH));
    const px = Math.round(this.pos.x + this.vel.x);
    const py = Math.round(this.pos.y + this.vel.y);

    let best = { x: px, y: py, s: -1 };
    const tryAt = (x: number, y: number) => {
      if (x < minX || x > maxX || y < minY || y > maxY) return;
      const s = this.score(frame, x, y);
      if (s > best.s) best = { x, y, s };
    };
    for (let y = py - radius; y <= py + radius; y += 2) for (let x = px - radius; x <= px + radius; x += 2) tryAt(x, y);
    const coarse = best;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tryAt(coarse.x + dx, coarse.y + dy);

    if (best.s < LOST_SCORE) return null;

    this.vel = { x: (best.x - this.pos.x) * 0.7, y: (best.y - this.pos.y) * 0.7 };
    this.pos = { x: best.x, y: best.y };
    if (best.s > ADAPT_SCORE) {
      const fresh = this.extract(frame, best.x, best.y, w, h, ox, oy);
      const vals = new Float32Array(this.base.vals.length);
      for (let i = 0; i < vals.length; i++) vals[i] = (1 - ADAPT_WEIGHT) * this.base.vals[i] + ADAPT_WEIGHT * fresh.vals[i];
      this.tpl = { ...this.base, vals, norm: normalize(vals) };
    }
    return { anchor: { x: best.x / this.w, y: best.y / this.h }, score: best.s };
  }
}

/**
 * Z kľúčových bodov vytvorených sledovaním (zoznam časov `created`) nechá len tie, bez ktorých
 * by sa dráha sledovaného tvaru odchýlila viac ako `tolerance` (Douglas–Peucker po čase).
 */
export function simplifyTrackedKeyframes(keyframes: Keyframe[], shapeId: string, created: Set<number>, tolerance = 0.004): Keyframe[] {
  const anchorOf = (k: Keyframe) => {
    const s = k.shapes.find((sh) => sh.id === shapeId);
    return s ? shapeAnchor(s) : null;
  };
  const keep = new Set<number>();
  const segment = (i: number, j: number) => {
    const a = anchorOf(keyframes[i]);
    const b = anchorOf(keyframes[j]);
    if (!a || !b) return;
    let worst = -1, worstK = -1;
    for (let k = i + 1; k < j; k++) {
      const p = anchorOf(keyframes[k]);
      if (!p) continue;
      const f = (keyframes[k].time - keyframes[i].time) / (keyframes[j].time - keyframes[i].time);
      const d = Math.hypot(p.x - (a.x + (b.x - a.x) * f), p.y - (a.y + (b.y - a.y) * f));
      if (d > worst) {
        worst = d;
        worstK = k;
      }
    }
    if (worst > tolerance) {
      keep.add(worstK);
      segment(i, worstK);
      segment(worstK, j);
    }
  };
  segment(0, keyframes.length - 1);
  return keyframes.filter((k, idx) => !created.has(k.time) || keep.has(idx) || idx === 0 || idx === keyframes.length - 1);
}
