import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "@/lib/db/db";
import { addPlayer, deletePlayer, updatePlayer } from "@/lib/db/operations";
import { Trash2, Plus } from "lucide-react";

const POSITIONS = ["GK", "OB", "SO", "KR", "ÚT"];

export default function RosterEditor({ projectId }: { projectId: string }) {
  const players = useLiveQuery(() => db.players.where("projectId").equals(projectId).sortBy("order"), [projectId], []);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [position, setPosition] = useState(POSITIONS[1]);

  async function handleAdd() {
    if (!name.trim() || !number.trim()) return;
    await addPlayer(projectId, { name: name.trim(), number: Number(number), position });
    setName("");
    setNumber("");
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto">
      <div className="card p-3 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Pridať hráča</h3>
        <div className="flex gap-2">
          <input className="input w-16" placeholder="č." value={number} onChange={(e) => setNumber(e.target.value)} />
          <input className="input flex-1" placeholder="Meno" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <select className="input" value={position} onChange={(e) => setPosition(e.target.value)}>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button className="btn-primary" onClick={handleAdd}>
            <Plus size={15} /> Pridať
          </button>
        </div>
      </div>

      <div className="card divide-y divide-white/5">
        {players?.length === 0 && <p className="text-sm text-gray-500 text-center py-6">Súpiska je prázdna.</p>}
        {players?.map((p) => (
          <div key={p.id} className="flex items-center gap-2 px-3 py-2 group">
            <input
              className="input w-14 text-center"
              value={p.number}
              onChange={(e) => updatePlayer(p.id, { number: Number(e.target.value) || 0 })}
            />
            <input
              className="input flex-1"
              value={p.name}
              onChange={(e) => updatePlayer(p.id, { name: e.target.value })}
            />
            <select
              className="input w-20"
              value={p.position}
              onChange={(e) => updatePlayer(p.id, { position: e.target.value })}
            >
              {POSITIONS.map((pos) => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>
            <button
              className="btn-ghost p-1.5 text-red-400 opacity-0 group-hover:opacity-100"
              onClick={() => deletePlayer(p.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
