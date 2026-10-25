import { drawShapesOnCanvas } from "@/lib/drawing/renderShapes";
import type { Shape } from "@/types";

export const EXPORT_WIDTH = 1280;
export const EXPORT_HEIGHT = 720;

async function canvasToPng(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Uint8Array> {
  let blob: Blob;
  if (canvas instanceof HTMLCanvasElement) {
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob zlyhalo"))), "image/png")
    );
  } else {
    blob = await canvas.convertToBlob({ type: "image/png" });
  }
  return new Uint8Array(await blob.arrayBuffer());
}

function makeCanvas(w: number, h: number) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Vygeneruje transparentné PNG s kresbou (šípky, čiary, zóny...) na prekrytie videa. */
export async function renderDrawingOverlayPng(shapes: Shape[], width = EXPORT_WIDTH, height = EXPORT_HEIGHT): Promise<Uint8Array> {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  drawShapesOnCanvas(ctx, shapes, width, height);
  return canvasToPng(canvas);
}

/** Vygeneruje PNG titulok klipu (názov tagu, hráč, minúta) na krátke zobrazenie na začiatku klipu. */
export async function renderTitleCardPng(
  lines: string[],
  width = EXPORT_WIDTH,
  height = EXPORT_HEIGHT
): Promise<Uint8Array> {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, width, height);

  const paddingX = 24;
  const paddingY = 14;
  const fontSize = Math.round(height * 0.042);
  ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  const textWidths = lines.map((l) => ctx.measureText(l).width);
  const boxWidth = Math.max(...textWidths, 100) + paddingX * 2;
  const boxHeight = lines.length * fontSize * 1.35 + paddingY * 2;

  ctx.fillStyle = "rgba(10, 20, 16, 0.78)";
  roundRect(ctx, 20, 20, boxWidth, boxHeight, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(34,197,94,0.9)";
  ctx.lineWidth = 2;
  roundRect(ctx, 20, 20, boxWidth, boxHeight, 10);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "top";
  lines.forEach((line, i) => {
    ctx.font = i === 0 ? `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif` : `500 ${Math.round(fontSize * 0.8)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = i === 0 ? "#ffffff" : "#9ca3af";
    ctx.fillText(line, 20 + paddingX, 20 + paddingY + i * fontSize * 1.35);
  });

  return canvasToPng(canvas);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
