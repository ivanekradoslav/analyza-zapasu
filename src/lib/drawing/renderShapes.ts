import { spotlightBeamHeightPx } from "@/lib/drawing/shapeGeometry";
import type { Shape, SpotlightShape } from "@/types";

function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Svetelný stĺp nad hráčom: žiara od nôh nahor (slabne), biely kruh pri nohách, štítok pod ním. */
function drawSpotlight(ctx: CanvasRenderingContext2D, shape: SpotlightShape, width: number, height: number) {
  const cx = shape.center.x * width;
  const cy = shape.center.y * height;
  const rx = Math.max(3, shape.radiusX * width);
  const ry = Math.max(2, shape.radiusY * height);
  const beamH = spotlightBeamHeightPx(shape, width);

  // stĺp svetla
  ctx.save();
  ctx.filter = `blur(${Math.max(1.5, rx * 0.22)}px)`;
  const beam = ctx.createLinearGradient(0, cy, 0, cy - beamH);
  beam.addColorStop(0, withAlpha(shape.color, 0.75));
  beam.addColorStop(0.5, withAlpha(shape.color, 0.4));
  beam.addColorStop(1, withAlpha(shape.color, 0));
  ctx.fillStyle = beam;
  const bw = rx * 1.1;
  ctx.beginPath();
  ctx.moveTo(cx - bw, cy);
  ctx.lineTo(cx - bw * 0.85, cy - beamH);
  ctx.lineTo(cx + bw * 0.85, cy - beamH);
  ctx.lineTo(cx + bw, cy);
  ctx.ellipse(cx, cy, bw, ry, 0, 0, Math.PI);
  ctx.fill();
  ctx.restore();

  // svetlo na zemi + kruh
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(shape.color, 0.35);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, rx * 0.08);
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.stroke();

  if (shape.label) {
    const fontPx = Math.max(10, rx * 0.42);
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

// Vykreslí zoznam tvarov (normalizované súradnice 0..1) na canvas danej
// pixelovej veľkosti. Používa sa pri živom prekrytí videa aj pri generovaní
// PNG prekrytia pre export (musí byť 1:1 rovnaký výsledok).
export function drawShapesOnCanvas(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  width: number,
  height: number
) {
  ctx.clearRect(0, 0, width, height);
  const refUnit = Math.min(width, height);

  for (const shape of shapes) {
    ctx.save();
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
    ctx.lineWidth = (shape.strokeWidth / 400) * refUnit;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

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
    ctx.restore();
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
