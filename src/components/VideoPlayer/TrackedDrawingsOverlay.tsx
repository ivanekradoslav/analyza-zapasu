import { useEffect, useMemo, useRef } from "react";
import { drawShapesOnCanvas } from "@/lib/drawing/renderShapes";
import { activeTrackShapes, isTrackDrawing } from "@/lib/drawing/keyframes";
import { useAppStore } from "@/store/useAppStore";
import type { Drawing } from "@/types";

// Prekreslenie v každom animačnom snímku podľa video.currentTime (timeupdate chodí len ~4×/s, to by sekalo).
export default function TrackedDrawingsOverlay({ drawings, width, height }: { drawings: Drawing[]; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tracks = useMemo(() => drawings.filter(isTrackDrawing), [drawings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || tracks.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    let lastT = -1;
    const tick = () => {
      const t = useAppStore.getState().videoEl?.currentTime ?? 0;
      if (t !== lastT) {
        lastT = t;
        drawShapesOnCanvas(ctx, activeTrackShapes(tracks, t), width, height);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tracks, width, height]);

  if (tracks.length === 0) return null;
  return <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0" style={{ width, height }} />;
}
