import { useMemo, useRef } from "react";
import { isConvexQuad, makeProjection } from "@/lib/drawing/pitch";
import type { PitchCalibration, Point } from "@/types";

interface Props {
  width: number;
  height: number;
  calibration: PitchCalibration;
  onChange: (c: PitchCalibration) => void;
}

const GRID_STEP_M = 5;

/**
 * Nastavenie ihriska: 4 posúvateľné rohy známeho obdĺžnika (1,2 na bránkovej čiare) a náhľad
 * mriežky po 5 m — keď mriežka sedí na čiary trávnika, perspektíva je správne.
 */
export default function CalibrationOverlay({ width, height, calibration, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<number | null>(null);
  const proj = useMemo(() => makeProjection(calibration), [calibration]);
  const valid = !!proj && isConvexQuad(calibration.corners);

  const px = (p: Point) => ({ x: p.x * width, y: p.y * height });

  // mriežka okolo obdĺžnika (aj mimo neho), aby bolo vidieť perspektívu celej plochy
  const gridLines = useMemo(() => {
    if (!proj) return [];
    const { widthM: W, depthM: D } = calibration;
    const lines: { a: Point; b: Point; strong: boolean }[] = [];
    const xMin = -Math.ceil(W / GRID_STEP_M) * GRID_STEP_M;
    const xMax = W * 2;
    const yMin = -GRID_STEP_M * 2;
    const yMax = D + 40;
    const seg = (a: Point, b: Point, strong: boolean) => {
      // úsek rozdelíme, aby časti za horizontom nevyrobili nezmyselnú čiaru
      const n = 12;
      for (let i = 0; i < n; i++) {
        const p0 = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
        const p1 = { x: a.x + ((b.x - a.x) * (i + 1)) / n, y: a.y + ((b.y - a.y) * (i + 1)) / n };
        const q0 = proj.toImage(p0);
        const q1 = proj.toImage(p1);
        if (q0 && q1 && Math.abs(q0.x) < 4 && Math.abs(q1.x) < 4 && Math.abs(q0.y) < 4 && Math.abs(q1.y) < 4) {
          lines.push({ a: q0, b: q1, strong });
        }
      }
    };
    for (let x = xMin; x <= xMax; x += GRID_STEP_M) seg({ x, y: yMin }, { x, y: yMax }, false);
    for (let y = yMin; y <= yMax; y += GRID_STEP_M) seg({ x: xMin, y }, { x: xMax, y }, false);
    return lines;
  }, [proj, calibration]);

  function toPoint(e: React.PointerEvent): Point {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  function onMove(e: React.PointerEvent) {
    const i = dragRef.current;
    if (i === null) return;
    const corners = calibration.corners.map((c, k) => (k === i ? toPoint(e) : c)) as PitchCalibration["corners"];
    onChange({ ...calibration, corners });
  }

  const c = calibration.corners.map(px);
  const edgeLabels = [
    { i: 0, j: 1, text: "bránková čiara" },
    { i: 1, j: 2, text: `${calibration.depthM.toString().replace(".", ",")} m` },
  ];

  return (
    <svg
      ref={svgRef}
      className="absolute left-0 top-0 z-20"
      width={width}
      height={height}
      onPointerMove={onMove}
      onPointerUp={() => (dragRef.current = null)}
      onPointerLeave={() => (dragRef.current = null)}
      style={{ touchAction: "none" }}
    >
      <rect width={width} height={height} fill="rgba(0,0,0,0.25)" />
      {valid &&
        gridLines.map((l, k) => (
          <line
            key={k}
            x1={l.a.x * width}
            y1={l.a.y * height}
            x2={l.b.x * width}
            y2={l.b.y * height}
            stroke="rgba(250, 204, 21, 0.45)"
            strokeWidth={1}
          />
        ))}
      <polygon
        points={c.map((p) => `${p.x},${p.y}`).join(" ")}
        fill={valid ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.25)"}
        stroke={valid ? "#22c55e" : "#ef4444"}
        strokeWidth={2}
      />
      {/* bránková čiara zvýraznená */}
      <line x1={c[0].x} y1={c[0].y} x2={c[1].x} y2={c[1].y} stroke="#ffffff" strokeWidth={3} />
      {edgeLabels.map(({ i, j, text }) => (
        <text
          key={text}
          x={(c[i].x + c[j].x) / 2}
          y={(c[i].y + c[j].y) / 2 - 8}
          textAnchor="middle"
          className="select-none"
          fill="#fff"
          stroke="rgba(0,0,0,0.8)"
          strokeWidth={3}
          paintOrder="stroke"
          fontSize={12}
          fontWeight={700}
        >
          {text}
        </text>
      ))}
      {c.map((p, i) => (
        <g
          key={i}
          style={{ cursor: "grab" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
            dragRef.current = i;
          }}
        >
          <circle cx={p.x} cy={p.y} r={16} fill="transparent" />
          <circle cx={p.x} cy={p.y} r={9} fill={i < 2 ? "#ffffff" : "#facc15"} stroke="#000" strokeWidth={1.5} />
          <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#000" className="pointer-events-none select-none">
            {i + 1}
          </text>
        </g>
      ))}
      {!valid && (
        <text x={width / 2} y={24} textAnchor="middle" fill="#fca5a5" fontSize={14} fontWeight={700} stroke="rgba(0,0,0,0.8)" strokeWidth={3} paintOrder="stroke">
          Rohy sú prekrížené – poradie 1 → 2 → 3 → 4 musí ísť dookola
        </text>
      )}
    </svg>
  );
}
