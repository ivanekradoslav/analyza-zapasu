import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db } from "@/lib/db/db";
import { createPlaylist, deletePlaylist, updatePlaylist } from "@/lib/db/operations";
import { useAppStore } from "@/store/useAppStore";
import { formatTime } from "@/lib/utils/time";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Trash2, Play, GripVertical, FileVideo2 } from "lucide-react";
import ExportDialog from "@/components/Export/ExportDialog";
import type { Clip, Playlist } from "@/types";

export default function PlaylistEditor({ projectId }: { projectId: string }) {
  const playlists = useLiveQuery(() => db.playlists.where("projectId").equals(projectId).toArray(), [projectId], []);
  const clips = useLiveQuery(() => db.clips.where("projectId").equals(projectId).toArray(), [projectId], []);
  const startPlayQueue = useAppStore((s) => s.startPlayQueue);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [exportingPlaylist, setExportingPlaylist] = useState<Playlist | null>(null);

  const selected = playlists?.find((p) => p.id === selectedId) ?? null;
  const clipMap = useMemo(() => new Map(clips?.map((c) => [c.id, c]) ?? []), [clips]);

  async function handleCreate() {
    if (!newName.trim()) return;
    const pl = await createPlaylist(projectId, newName.trim());
    setNewName("");
    setSelectedId(pl.id);
  }

  async function handleAddClip(clipId: string) {
    if (!selected || selected.clipIds.includes(clipId)) return;
    await updatePlaylist(selected.id, { clipIds: [...selected.clipIds, clipId] });
  }

  async function handleRemoveClip(clipId: string) {
    if (!selected) return;
    await updatePlaylist(selected.id, { clipIds: selected.clipIds.filter((id) => id !== clipId) });
  }

  async function handleDragEnd(e: DragEndEvent) {
    if (!selected) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = selected.clipIds.indexOf(String(active.id));
    const newIndex = selected.clipIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    await updatePlaylist(selected.id, { clipIds: arrayMove(selected.clipIds, oldIndex, newIndex) });
  }

  function playlistClips(pl: Playlist): Clip[] {
    return pl.clipIds.map((id) => clipMap.get(id)).filter((c): c is Clip => !!c);
  }

  return (
    <div className="card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Playlisty</h3>
      </div>

      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Nový playlist..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
        />
        <button className="btn-primary shrink-0" onClick={handleCreate}>
          <Plus size={15} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {playlists?.map((pl) => (
          <button
            key={pl.id}
            onClick={() => setSelectedId(pl.id)}
            className={`rounded-full px-3 py-1 text-xs ${selectedId === pl.id ? "bg-emerald-600 text-white" : "bg-pitch-700 text-gray-300"}`}
          >
            {pl.name} ({pl.clipIds.length})
          </button>
        ))}
      </div>

      {selected && (
        <div className="space-y-2 border-t border-white/10 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-200">{selected.name}</span>
            <div className="flex gap-1.5">
              <button
                className="btn-secondary"
                disabled={selected.clipIds.length === 0}
                onClick={() => startPlayQueue(playlistClips(selected))}
                title="Prehrať celý playlist"
              >
                <Play size={14} /> Prehrať
              </button>
              <button className="btn-secondary" disabled={selected.clipIds.length === 0} onClick={() => setExportingPlaylist(selected)}>
                <FileVideo2 size={14} /> Export MP4
              </button>
              <button
                className="btn-ghost p-1.5 text-red-400"
                onClick={() => {
                  if (confirm("Odstrániť playlist?")) {
                    deletePlaylist(selected.id);
                    setSelectedId(null);
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={selected.clipIds} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-white/5 rounded border border-white/5">
                {selected.clipIds.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-3">Playlist je prázdny, pridaj klipy nižšie.</p>
                )}
                {selected.clipIds.map((clipId) => {
                  const clip = clipMap.get(clipId);
                  if (!clip) return null;
                  return <SortableClipRow key={clipId} id={clipId} clip={clip} onRemove={() => handleRemoveClip(clipId)} />;
                })}
              </div>
            </SortableContext>
          </DndContext>

          <div>
            <label className="label">Pridať klip do playlistu</label>
            <select className="input" value="" onChange={(e) => e.target.value && handleAddClip(e.target.value)}>
              <option value="">— vyber klip —</option>
              {clips
                ?.filter((c) => !selected.clipIds.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({formatTime(c.inPoint)}–{formatTime(c.outPoint)})
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}

      {exportingPlaylist && (
        <ExportDialog
          projectId={projectId}
          playlist={exportingPlaylist}
          clips={playlistClips(exportingPlaylist)}
          onClose={() => setExportingPlaylist(null)}
        />
      )}
    </div>
  );
}

function SortableClipRow({ id, clip, onRemove }: { id: string; clip: Clip; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-2 px-2 py-1.5 bg-pitch-800"
    >
      <button {...attributes} {...listeners} className="text-gray-500 cursor-grab touch-none">
        <GripVertical size={14} />
      </button>
      <span className="flex-1 text-sm text-gray-200 truncate">{clip.name}</span>
      <span className="text-xs text-gray-500">{formatTime(clip.inPoint)}–{formatTime(clip.outPoint)}</span>
      <button className="btn-ghost p-1 text-red-400" onClick={onRemove}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}
