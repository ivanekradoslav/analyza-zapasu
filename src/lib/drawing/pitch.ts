import type { PitchCalibration, Point } from "@/types";

/*
 * Perspektíva ihriska (homografia). Užívateľ priloží 4 rohy známeho obdĺžnika na tráve
 * (napr. šestnástky) a z toho vieme prepočítať akýkoľvek bod obrazu na metre na ihrisku a späť.
 *
 * Súradnice ihriska (metre): roh 1 = (0,0), roh 2 = (šírka,0) – oba na bránkovej čiare,
 * roh 3 = (šírka,hĺbka), roh 4 = (0,hĺbka). Os X ide pozdĺž bránkovej čiary, os Y do ihriska.
 * Obraz: normalizované 0..1 (rovnako ako všetky tvary).
 */

export type Mat3 = [number, number, number, number, number, number, number, number, number];

export interface PitchPreset {
  id: string;
  label: string;
  widthM: number;
  depthM: number;
}

export const PITCH_PRESETS: PitchPreset[] = [
  { id: "penalty", label: "Šestnástka (pokutové územie)", widthM: 40.32, depthM: 16.5 },
  { id: "goal", label: "Malé vápno (bránkové územie)", widthM: 18.32, depthM: 5.5 },
  { id: "custom", label: "Vlastné rozmery", widthM: 30, depthM: 12 },
];

export const DEFAULT_CORNERS: [Point, Point, Point, Point] = [
  { x: 0.3, y: 0.42 },
  { x: 0.62, y: 0.42 },
  { x: 0.74, y: 0.72 },
  { x: 0.18, y: 0.72 },
];

/** Rieši 8×8 sústavu Gaussovou elimináciou s výberom pivota. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Homografia H, ktorá zobrazí src[i] → dst[i] (4 páry bodov). */
export function computeHomography(src: Point[], dst: Point[]): Mat3 | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  if (!h || h.some((n) => !Number.isFinite(n))) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function invert(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-14) return null;
  const k = 1 / det;
  return [
    A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k,
  ];
}

/** Aplikuje H; vráti null pre body „za kamerou“ (w ≤ 0). */
export function apply(m: Mat3, p: Point): Point | null {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  if (w <= 1e-9) return null;
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w };
}

export interface PitchProjection {
  /** metre na ihrisku → normalizovaný bod obrazu */
  toImage(p: Point): Point | null;
  /** normalizovaný bod obrazu → metre na ihrisku */
  toPitch(p: Point): Point | null;
  calibration: PitchCalibration;
}

function pitchCorners(c: PitchCalibration): Point[] {
  return [
    { x: 0, y: 0 },
    { x: c.widthM, y: 0 },
    { x: c.widthM, y: c.depthM },
    { x: 0, y: c.depthM },
  ];
}

/** Zo 4 rohov a rozmerov vyrobí prepočet medzi obrazom a ihriskom (null pri nezmyselnom štvoruholníku). */
export function makeProjection(c: PitchCalibration | undefined | null): PitchProjection | null {
  if (!c || c.widthM <= 0 || c.depthM <= 0) return null;
  const toImg = computeHomography(pitchCorners(c), c.corners);
  if (!toImg) return null;
  const toPitchM = invert(toImg);
  if (!toPitchM) return null;
  // homografia musí rohy zobraziť „pred kameru“ (inak je štvoruholník prekrížený)
  if (pitchCorners(c).some((p) => !apply(toImg, p))) return null;
  return {
    toImage: (p) => apply(toImg, p),
    toPitch: (p) => apply(toPitchM, p),
    calibration: c,
  };
}

export function pitchDistance(proj: PitchProjection, a: Point, b: Point): number | null {
  const pa = proj.toPitch(a);
  const pb = proj.toPitch(b);
  if (!pa || !pb) return null;
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

/** Je štvoruholník konvexný (rohy nie sú prekrížené)? */
export function isConvexQuad(q: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

export function formatMeters(m: number) {
  return `${m.toFixed(m < 10 ? 1 : 0).replace(".", ",")} m`;
}
