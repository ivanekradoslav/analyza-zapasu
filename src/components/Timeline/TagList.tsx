import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db } from "@/lib/db/db";
import { addClip, deleteTagEvent, updateTagEvent } from "@/lib/db/operations";
import { useAppStore } from "@/store/useAppStore";
import { formatTime, clamp } from "@/lib/utils/time";
import { CATEGORY_LABELS } from "@/lib/db/defaultTags";
import type { Half, Team } from "@/types";
import { Trash2, Pencil, Scissors } from "lucide-react";

export default function TagList({ projectId }: { projectId: string }) {
  const requestSeek = useAppStore((s) => s.requestSeek);
  const tagEvents = useLiveQuery(() => db.tagEvents.where("projectId").equals(projectId).toArray(), [projectId], []);
  const tagTypes = useLiveQuery(() => db.tagTypes.where("projectId").equals(projectId).toArray(), [projectId], []);
  const players = useLiveQuery(() => db.players.where("projectId").equals(projectId).toArray(), [projectId], []);

  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterTeam, setFilterTeam] = useState<Team | "all">("all");
  const [filterPlayer, setFilterPlayer] = useState<string>("all");
  const [filterHalf, setFilterHalf] = useState<Half | "all">("all");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const tagTypeMap = useMemo(() => new Map(tagTypes?.map((t) => [t.id, t]) ?? []), [tagTypes]);
  const playerMap = useMemo(() => new Map(players?.map((p) => [p.id, p]) ?? []), [players]);

  const filtered = useMemo(() => {
    return (tagEvents ?? [])
      .filter((ev) => {
        const type = tagTypeMap.get(ev.tagTypeId);
        if (filterCategory !== "all" && type?.category !== filterCategory) return false;
        if (filterTeam !== "all" && ev.team !== filterTeam) return false;
        if (filterPlayer !== "all" && ev.playerId !== filterPlayer) return false;
        if (filterHalf !== "all" && ev.half !== filterHalf) return false;
        return true;
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [tagEvents, tagTypeMap, filterCategory, filterTeam, filterPlayer, filterHalf]);

  return (
    <div className="card h-56 shrink-0 min-h-0 flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-2.5">
        <select className="input w-auto" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="all">Všetky kategórie</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select className="input w-auto" value={filterTeam} onChange={(e) => setFilterTeam(e.target.value as Team | "all")}>
          <option value="all">Oba tímy</option>
          <option value="my">Môj tím</option>
          <option value="opponent">Súper</option>
        </select>
        <select className="input w-auto" value={filterPlayer} onChange={(e) => setFilterPlayer(e.target.value)}>
          <option value="all">Všetci hráči</option>
          {players?.map((p) => (
            <option key={p.id} value={p.id}>#{p.number} {p.name}</option>
          ))}
        </select>
        <select
          className="input w-auto"
          value={filterHalf}
          onChange={(e) => setFilterHalf(e.target.value === "all" ? "all" : (Number(e.target.value) as Half))}
        >
          <option value="all">Oba polčasy</option>
          <option value={1}>1. polčas</option>
          <option value={2}>2. polčas</option>
        </select>
        <span className="ml-auto text-xs text-gray-500">{filtered.length} záznamov</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/5">
        {filtered.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">Žiadne tagy. Použi klávesové skratky alebo panel vpravo.</p>
        )}
        {filtered.map((ev) => {
          const type = tagTypeMap.get(ev.tagTypeId);
          const player = ev.playerId ? playerMap.get(ev.playerId) : undefined;
          return (
            <div key={ev.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 group">
              <button
                className="flex items-center gap-2 flex-1 text-left"
                onClick={() => requestSeek(ev.timestamp)}
              >
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: type?.color ?? "#888" }} />
                <span className="text-sm text-gray-200 font-medium">{type?.name ?? "?"}</span>
                <span className="text-xs text-gray-500">{formatTime(ev.timestamp)}</span>
                <span className="text-xs text-gray-500">{ev.half}. pol.</span>
                <span className={`text-xs ${ev.team === "my" ? "text-emerald-400" : "text-red-400"}`}>
                  {ev.team === "my" ? "môj" : "súper"}
                </span>
                {player && <span className="text-xs text-gray-400">#{player.number} {player.name}</span>}
                {ev.note && editingNoteId !== ev.id && <span className="text-xs text-gray-500 italic truncate max-w-[160px]">"{ev.note}"</span>}
              </button>

              {editingNoteId === ev.id ? (
                <input
                  autoFocus
                  className="input w-40"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      await updateTagEvent(ev.id, { note: noteDraft });
                      setEditingNoteId(null);
                    }
                    if (e.key === "Escape") setEditingNoteId(null);
                  }}
                  onBlur={() => setEditingNoteId(null)}
                  placeholder="Poznámka..."
                />
              ) : (
                <button
                  className="btn-ghost p-1.5 opacity-0 group-hover:opacity-100"
                  onClick={() => {
                    setEditingNoteId(ev.id);
                    setNoteDraft(ev.note ?? "");
                  }}
                  title="Upraviť poznámku"
                >
                  <Pencil size={14} />
                </button>
              )}
              <button
                className="btn-ghost p-1.5 opacity-0 group-hover:opacity-100"
                title="Vytvoriť klip (-5s/+5s)"
                onClick={() =>
                  addClip({
                    projectId,
                    name: type?.name ?? "Klip",
                    inPoint: clamp(ev.timestamp - 5, 0, Infinity),
                    outPoint: ev.timestamp + 5,
                    sourceTagEventId: ev.id,
                  })
                }
              >
                <Scissors size={14} />
              </button>
              <button
                className="btn-ghost p-1.5 text-red-400 opacity-0 group-hover:opacity-100"
                onClick={() => deleteTagEvent(ev.id)}
                title="Odstrániť"
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
