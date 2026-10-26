import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db } from "@/lib/db/db";
import { addClip, createPlaylist, deleteClip, updateClip } from "@/lib/db/operations";
import { useAppStore } from "@/store/useAppStore";
import { formatTime } from "@/lib/utils/time";
import { Scissors, Play, Trash2, LogIn, LogOut, ListPlus, X } from "lucide-react";
import type { Clip, Player } from "@/types";

function playerLabel(p: Player) {
  const surname = p.name.replace(/\s*\(C\)\s*$/, "").split(/\s+/).pop();
  return `#${p.number} ${surname}`;
}

export default function ClipManager({ projectId }: { projectId: string }) {
  const clips = useLiveQuery(() => db.clips.where("projectId").equals(projectId).reverse().sortBy("createdAt"), [projectId], []);
  const players = useLiveQuery(() => db.players.where("projectId").equals(projectId).sortBy("order"), [projectId], []);
  const playerMap = useMemo(() => new Map(players?.map((p) => [p.id, p]) ?? []), [players]);
  const [playerFilter, setPlayerFilter] = useState("all");
  const [playlistNote, setPlaylistNote] = useState<string | null>(null);
  const visibleClips = (clips ?? []).filter((c) => playerFilter === "all" || c.playerIds?.includes(playerFilter));
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

  function setClipPlayers(clip: Clip, playerIds: string[]) {
    void updateClip(clip.id, { playerIds });
  }

  async function handlePlaylistForPlayer() {
    const player = playerMap.get(playerFilter);
    if (!player || visibleClips.length === 0) return;
    const ordered = [...visibleClips].sort((a, b) => a.inPoint - b.inPoint);
    const name = `${playerLabel(player)} – zostrih`;
    await createPlaylist(projectId, name, ordered.map((c) => c.id));
    const n = ordered.length;
    const word = n === 1 ? "klip" : n < 5 ? "klipy" : "klipov";
    setPlaylistNote(`Playlist „${name}“ (${n} ${word}) je dole v Playlistoch.`);
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

      {clips && clips.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <select
              className="input flex-1"
              value={playerFilter}
              onChange={(e) => {
                setPlayerFilter(e.target.value);
                setPlaylistNote(null);
              }}
            >
              <option value="all">Klipy všetkých hráčov</option>
              {players?.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {p.name}
                </option>
              ))}
            </select>
            <button
              className="btn-secondary shrink-0"
              disabled={playerFilter === "all" || visibleClips.length === 0}
              onClick={handlePlaylistForPlayer}
              title="Vytvorí playlist zo všetkých klipov vybraného hráča (chronologicky)"
            >
              <ListPlus size={14} /> Playlist hráča
            </button>
          </div>
          {playlistNote && <p className="text-xs text-emerald-300">{playlistNote}</p>}
        </div>
      )}

      <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
        {clips?.length === 0 && <p className="text-sm text-gray-500 text-center py-4">Žiadne klipy. Vytvor z tagu alebo I/O bodov.</p>}
        {clips && clips.length > 0 && visibleClips.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">Tento hráč zatiaľ nemá priradený žiadny klip.</p>
        )}
        {visibleClips.map((c) => (
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
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {(c.playerIds ?? []).map((id) => {
                  const p = playerMap.get(id);
                  if (!p) return null;
                  return (
                    <span key={id} className="inline-flex items-center gap-0.5 rounded bg-emerald-900/60 px-1.5 py-0.5 text-[11px] text-emerald-200">
                      {playerLabel(p)}
                      <button
                        className="text-emerald-300/70 hover:text-white"
                        title="Odobrať hráča z klipu"
                        onClick={() => setClipPlayers(c, (c.playerIds ?? []).filter((x) => x !== id))}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  );
                })}
                {players && players.some((p) => !c.playerIds?.includes(p.id)) && (
                  <select
                    className="rounded bg-pitch-900 px-1 py-0.5 text-[11px] text-gray-400 hover:text-gray-200"
                    value=""
                    title="Priradiť hráča ku klipu"
                    onChange={(e) => e.target.value && setClipPlayers(c, [...(c.playerIds ?? []), e.target.value])}
                  >
                    <option value="">+ hráč</option>
                    {players
                      .filter((p) => !c.playerIds?.includes(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          #{p.number} {p.name}
                        </option>
                      ))}
                  </select>
                )}
                {players?.length === 0 && <span className="text-[11px] text-gray-600">Pridaj hráčov v záložke Súpiska.</span>}
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
