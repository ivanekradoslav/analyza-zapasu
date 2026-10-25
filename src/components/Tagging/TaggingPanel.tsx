import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db } from "@/lib/db/db";
import { addTagEvent } from "@/lib/db/operations";
import { useAppStore } from "@/store/useAppStore";
import { CATEGORY_LABELS } from "@/lib/db/defaultTags";
import type { TagCategory, TagType } from "@/types";
import TagEditorModal from "@/components/Tagging/TagEditorModal";
import { Plus, Users, Shield } from "lucide-react";
import clsx from "clsx";

const CATEGORY_ORDER: TagCategory[] = ["phase", "event", "press", "custom"];

export default function TaggingPanel({ projectId }: { projectId: string }) {
  const tagTypes = useLiveQuery(() => db.tagTypes.where("projectId").equals(projectId).sortBy("order"), [projectId], []);
  const players = useLiveQuery(() => db.players.where("projectId").equals(projectId).sortBy("order"), [projectId], []);

  const activeTeam = useAppStore((s) => s.activeTeam);
  const toggleActiveTeam = useAppStore((s) => s.toggleActiveTeam);
  const activePlayerId = useAppStore((s) => s.activePlayerId);
  const setActivePlayerId = useAppStore((s) => s.setActivePlayerId);
  const activeHalf = useAppStore((s) => s.activeHalf);
  const setActiveHalf = useAppStore((s) => s.setActiveHalf);
  const currentTime = useAppStore((s) => s.currentTime);

  const [editingTagId, setEditingTagId] = useState<string | "new" | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const byCat = new Map<TagCategory, TagType[]>();
    for (const cat of CATEGORY_ORDER) byCat.set(cat, []);
    tagTypes?.forEach((t) => byCat.get(t.category)?.push(t));
    return byCat;
  }, [tagTypes]);

  async function handleTag(tagTypeId: string) {
    await addTagEvent({
      projectId,
      tagTypeId,
      team: activeTeam,
      playerId: activePlayerId ?? undefined,
      timestamp: currentTime,
      half: activeHalf,
    });
    setFlashId(tagTypeId);
    window.setTimeout(() => setFlashId(null), 220);
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto">
      <div className="card p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="label mb-0">Tím (Tab)</span>
          <button
            className={clsx(
              "btn-secondary",
              activeTeam === "my" ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-red-700/80 text-white hover:bg-red-600"
            )}
            onClick={toggleActiveTeam}
          >
            {activeTeam === "my" ? <Users size={15} /> : <Shield size={15} />}
            {activeTeam === "my" ? "Môj tím" : "Súper"}
          </button>
        </div>

        <div>
          <span className="label">Hráč (číslo na klávesnici)</span>
          <select
            className="input"
            value={activePlayerId ?? ""}
            onChange={(e) => setActivePlayerId(e.target.value || null)}
          >
            <option value="">— bez hráča —</option>
            {players?.map((p) => (
              <option key={p.id} value={p.id}>#{p.number} · {p.name} ({p.position})</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between">
          <span className="label mb-0">Polčas</span>
          <div className="flex gap-1">
            {[1, 2].map((h) => (
              <button
                key={h}
                className={clsx("rounded px-2.5 py-1 text-xs", activeHalf === h ? "bg-emerald-600 text-white" : "bg-pitch-700 text-gray-300")}
                onClick={() => setActiveHalf(h as 1 | 2)}
              >
                {h}. polčas
              </button>
            ))}
          </div>
        </div>
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const items = grouped.get(cat) ?? [];
        if (items.length === 0) return null;
        return (
          <div key={cat} className="card p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{CATEGORY_LABELS[cat]}</h3>
              {cat === "custom" && (
                <button className="btn-ghost p-1" onClick={() => setEditingTagId("new")} title="Nový vlastný tag">
                  <Plus size={14} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTag(t.id)}
                  onDoubleClick={() => setEditingTagId(t.id)}
                  className={clsx(
                    "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-left transition-transform",
                    flashId === t.id && "scale-95"
                  )}
                  style={{ backgroundColor: t.color + "26", border: `1px solid ${t.color}66`, color: t.color }}
                  title={`Skratka: ${t.shortcut.toUpperCase()} (dvojklik = upraviť)`}
                >
                  <kbd className="rounded bg-black/30 px-1 text-[10px] text-gray-200">{t.shortcut.toUpperCase()}</kbd>
                  <span className="text-gray-100 truncate">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {!CATEGORY_ORDER.some((c) => (grouped.get(c) ?? []).length > 0 && c === "custom") && (
        <button className="btn-secondary justify-center" onClick={() => setEditingTagId("new")}>
          <Plus size={15} /> Vlastný tag
        </button>
      )}

      {editingTagId && (
        <TagEditorModal
          projectId={projectId}
          tagId={editingTagId === "new" ? null : editingTagId}
          onClose={() => setEditingTagId(null)}
        />
      )}
    </div>
  );
}
