import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import { addClip, deleteDrawing } from "@/lib/db/operations";
import { drawingSpan, isTrackDrawing } from "@/lib/drawing/keyframes";
import { useAppStore } from "@/store/useAppStore";
import { formatTime } from "@/lib/utils/time";
import { Scissors, Crosshair, Trash2, Pause, Footprints } from "lucide-react";
import type { Drawing } from "@/types";

const CLIP_PADDING_SEC = 3;

export default function DrawingList({ projectId }: { projectId: string }) {
  const drawings = useLiveQuery(() => db.drawings.where("projectId").equals(projectId).sortBy("timestamp"), [projectId], []);
  const requestSeek = useAppStore((s) => s.requestSeek);
  const duration = useAppStore((s) => s.duration);

  async function makeClip(d: Drawing) {
    const { start, end } = drawingSpan(d);
    await addClip({
      projectId,
      name: `Kresba ${formatTime(start)}`,
      inPoint: Math.max(0, start - CLIP_PADDING_SEC),
      outPoint: Math.min(duration || Infinity, end + CLIP_PADDING_SEC),
    });
  }

  return (
    <div className="card p-3 space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Kresby</h3>
      {drawings?.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-3">Žiadne kresby. Zastav video a klikni na „Kresliť“.</p>
      )}
      <div className="divide-y divide-white/5 max-h-60 overflow-y-auto">
        {drawings?.map((d) => {
          const track = isTrackDrawing(d);
          const { start, end } = drawingSpan(d);
          return (
            <div key={d.id} className="flex items-center gap-2 py-2 group">
              {track ? <Footprints size={14} className="text-amber-400 shrink-0" /> : <Pause size={14} className="text-amber-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-200 tabular-nums">
                  {track ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start)}
                </div>
                <div className="text-xs text-gray-500">
                  {track ? `Pohyblivá · ${d.keyframes.length} kľúčové body` : `Freeze ${d.durationSec}s`} · {d.shapes.length} tvary
                </div>
              </div>
              <button className="btn-ghost p-1.5" title="Skočiť na kresbu" onClick={() => requestSeek(start)}>
                <Crosshair size={14} />
              </button>
              <button className="btn-secondary px-2 py-1 text-xs" title="Vytvoriť klip okolo kresby (±3 s)" onClick={() => makeClip(d)}>
                <Scissors size={13} /> Klip
              </button>
              <button
                className="btn-ghost p-1.5 text-red-400 opacity-0 group-hover:opacity-100"
                title="Odstrániť kresbu"
                onClick={() => deleteDrawing(d.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
