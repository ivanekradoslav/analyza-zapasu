import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "@/lib/db/db";
import { addClip, deleteClip, updateClip } from "@/lib/db/operations";
import { useAppStore } from "@/store/useAppStore";
import { formatTime } from "@/lib/utils/time";
import { Scissors, Play, Trash2, LogIn, LogOut } from "lucide-react";

export default function ClipManager({ projectId }: { projectId: string }) {
  const clips = useLiveQuery(() => db.clips.where("projectId").equals(projectId).reverse().sortBy("createdAt"), [projectId], []);
  const currentTime = useAppStore((s) => s.currentTime);
  const ioIn = useAppStore((s) => s.ioIn);
  const ioOut = useAppStore((s) => s.ioOut);
  const setIoIn = useAppStore((s) => s.setIoIn);
  const setIoOut = useAppStore((s) => s.setIoOut);
  const startPlayQueue = useAppStore((s) => s.startPlayQueue);
  const [name, setName] = useState("");

  async function handleCreateManualClip() {
    if (ioIn === null || ioOut === null || ioOut <= ioIn) return;
    await addClip({
      projectId,
      name: name.trim() || `Klip ${formatTime(ioIn)}–${formatTime(ioOut)}`,
      inPoint: ioIn,
      outPoint: ioOut,
    });
    setIoIn(null);
    setIoOut(null);
    setName("");
  }

  return (
    <div className="card p-3 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Manuálny klip (I/O body)</h3>
      <div className="flex items-center gap-2">
        <button className="btn-secondary" onClick={() => setIoIn(currentTime)} title="Nastaviť vstupný bod (I)">
          <LogIn size={14} /> I: {ioIn !== null ? formatTime(ioIn) : "—"}
        </button>
        <button className="btn-secondary" onClick={() => setIoOut(currentTime)} title="Nastaviť výstupný bod (O)">
          <LogOut size={14} /> O: {ioOut !== null ? formatTime(ioOut) : "—"}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input className="input" placeholder="Názov klipu (voliteľné)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={ioIn === null || ioOut === null || ioOut <= ioIn} onClick={handleCreateManualClip}>
          <Scissors size={15} /> Vytvoriť
        </button>
      </div>

      <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
        {clips?.length === 0 && <p className="text-sm text-gray-500 text-center py-4">Žiadne klipy. Vytvor z tagu alebo I/O bodov.</p>}
        {clips?.map((c) => (
          <div key={c.id} className="flex items-center gap-2 py-2 group">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-200 truncate">{c.name}</div>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <input
                  type="number"
                  step={0.1}
                  className="w-16 rounded bg-pitch-900 px-1 py-0.5"
                  value={c.inPoint.toFixed(1)}
                  onChange={(e) => updateClip(c.id, { inPoint: Number(e.target.value) })}
                />
                <span>–</span>
                <input
                  type="number"
                  step={0.1}
                  className="w-16 rounded bg-pitch-900 px-1 py-0.5"
                  value={c.outPoint.toFixed(1)}
                  onChange={(e) => updateClip(c.id, { outPoint: Number(e.target.value) })}
                />
                <span>s · {(c.outPoint - c.inPoint).toFixed(1)}s</span>
              </div>
            </div>
            <button className="btn-ghost p-1.5" title="Prehrať klip" onClick={() => startPlayQueue([c])}>
              <Play size={14} />
            </button>
            <button
              className="btn-ghost p-1.5 text-red-400 opacity-0 group-hover:opacity-100"
              title="Odstrániť klip"
              onClick={() => deleteClip(c.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
