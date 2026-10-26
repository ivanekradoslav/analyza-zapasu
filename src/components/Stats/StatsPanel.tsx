import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db } from "@/lib/db/db";
import { CATEGORY_LABELS } from "@/lib/db/defaultTags";
import { toCsv, downloadTextFile } from "@/lib/utils/csv";
import { Download } from "lucide-react";

export default function StatsPanel({ projectId }: { projectId: string }) {
  const tagEvents = useLiveQuery(() => db.tagEvents.where("projectId").equals(projectId).toArray(), [projectId], []);
  const tagTypes = useLiveQuery(() => db.tagTypes.where("projectId").equals(projectId).toArray(), [projectId], []);
  const players = useLiveQuery(() => db.players.where("projectId").equals(projectId).toArray(), [projectId], []);
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);

  const tagTypeMap = useMemo(() => new Map(tagTypes?.map((t) => [t.id, t]) ?? []), [tagTypes]);
  const playerMap = useMemo(() => new Map(players?.map((p) => [p.id, p]) ?? []), [players]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    tagEvents?.forEach((e) => {
      const cat = tagTypeMap.get(e.tagTypeId)?.category ?? "custom";
      m.set(cat, (m.get(cat) ?? 0) + 1);
    });
    return m;
  }, [tagEvents, tagTypeMap]);

  const byTeam = useMemo(() => {
    const m = { my: 0, opponent: 0 };
    tagEvents?.forEach((e) => (m[e.team] += 1));
    return m;
  }, [tagEvents]);

  const byHalf = useMemo(() => {
    const m = { 1: 0, 2: 0 };
    tagEvents?.forEach((e) => (m[e.half] += 1));
    return m;
  }, [tagEvents]);

  const byTagType = useMemo(() => {
    const m = new Map<string, number>();
    tagEvents?.forEach((e) => m.set(e.tagTypeId, (m.get(e.tagTypeId) ?? 0) + 1));
    return [...m.entries()]
      .map(([id, count]) => ({ type: tagTypeMap.get(id), count }))
      .filter((x) => x.type)
      .sort((a, b) => b.count - a.count);
  }, [tagEvents, tagTypeMap]);

  const byTagTypeVsOpponent = useMemo(() => {
    const m = new Map<string, { my: number; opponent: number }>();
    tagEvents?.forEach((e) => {
      const cur = m.get(e.tagTypeId) ?? { my: 0, opponent: 0 };
      cur[e.team] += 1;
      m.set(e.tagTypeId, cur);
    });
    return [...m.entries()]
      .map(([id, counts]) => ({ type: tagTypeMap.get(id), ...counts }))
      .filter((x) => x.type)
      .sort((a, b) => b.my + b.opponent - (a.my + a.opponent));
  }, [tagEvents, tagTypeMap]);

  const byPlayer = useMemo(() => {
    const m = new Map<string, number>();
    tagEvents?.forEach((e) => {
      if (e.playerId) m.set(e.playerId, (m.get(e.playerId) ?? 0) + 1);
    });
    return [...m.entries()]
      .map(([id, count]) => ({ player: playerMap.get(id), count }))
      .filter((x) => x.player)
      .sort((a, b) => b.count - a.count);
  }, [tagEvents, playerMap]);

  function handleExportCsv() {
    const rows: (string | number)[][] = [["Kategória", "Tag", "Tím", "Hráč", "Polčas", "Čas (s)", "Poznámka"]];
    tagEvents
      ?.slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .forEach((e) => {
        const type = tagTypeMap.get(e.tagTypeId);
        const player = e.playerId ? playerMap.get(e.playerId) : undefined;
        rows.push([
          type ? (CATEGORY_LABELS[type.category] ?? type.category) : "",
          type?.name ?? "",
          e.team === "my" ? "Môj tím" : "Súper",
          player ? `#${player.number} ${player.name}` : "",
          e.half,
          e.timestamp.toFixed(1),
          e.note ?? "",
        ]);
      });
    downloadTextFile(`${(project?.name ?? "statistiky").replace(/[^a-z0-9_-]+/gi, "_")}_statistiky.csv`, toCsv(rows), "text/csv");
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto">
      <div className="card p-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Štatistiky</h3>
        <button className="btn-secondary" onClick={handleExportCsv}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="card p-3">
        <h4 className="text-xs text-gray-500 mb-2">Podľa kategórie</h4>
        {[...byCategory.entries()].map(([cat, count]) => (
          <StatRow key={cat} label={CATEGORY_LABELS[cat] ?? cat} count={count} />
        ))}
        {byCategory.size === 0 && <p className="text-sm text-gray-500">Žiadne dáta</p>}
      </div>

      <div className="card p-3">
        <h4 className="text-xs text-gray-500 mb-2">Tím / polčas</h4>
        <StatRow label="Môj tím" count={byTeam.my} />
        <StatRow label="Súper" count={byTeam.opponent} />
        <div className="h-2" />
        <StatRow label="1. polčas" count={byHalf[1]} />
        <StatRow label="2. polčas" count={byHalf[2]} />
      </div>

      <div className="card p-3">
        <h4 className="text-xs text-gray-500 mb-2">Porovnanie so súperom</h4>
        <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1.5">
          <span>Môj tím</span>
          <span>Súper</span>
        </div>
        {byTagTypeVsOpponent.map(({ type, my, opponent }) => (
          <VsRow key={type!.id} label={type!.name} my={my} opponent={opponent} />
        ))}
        {byTagTypeVsOpponent.length === 0 && <p className="text-sm text-gray-500">Žiadne dáta</p>}
      </div>

      <div className="card p-3">
        <h4 className="text-xs text-gray-500 mb-2">Podľa typu tagu</h4>
        {byTagType.map(({ type, count }) => (
          <StatRow key={type!.id} label={type!.name} count={count} color={type!.color} />
        ))}
        {byTagType.length === 0 && <p className="text-sm text-gray-500">Žiadne dáta</p>}
      </div>

      <div className="card p-3">
        <h4 className="text-xs text-gray-500 mb-2">Podľa hráča</h4>
        {byPlayer.map(({ player, count }) => (
          <StatRow key={player!.id} label={`#${player!.number} ${player!.name}`} count={count} />
        ))}
        {byPlayer.length === 0 && <p className="text-sm text-gray-500">Žiadne dáta</p>}
      </div>
    </div>
  );
}

function StatRow({ label, count, color }: { label: string; count: number; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="flex items-center gap-1.5 text-gray-300">
        {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
        {label}
      </span>
      <span className="font-medium text-gray-100">{count}</span>
    </div>
  );
}

function VsRow({ label, my, opponent }: { label: string; my: number; opponent: number }) {
  const total = my + opponent;
  const myPct = total === 0 ? 50 : (my / total) * 100;
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-100 w-6 text-left">{my}</span>
        <span className="text-gray-300 flex-1 text-center truncate px-1">{label}</span>
        <span className="font-medium text-gray-100 w-6 text-right">{opponent}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-pitch-900 flex mt-1">
        <div className="h-full bg-emerald-500" style={{ width: `${myPct}%` }} />
        <div className="h-full bg-red-700/80" style={{ width: `${100 - myPct}%` }} />
      </div>
    </div>
  );
}
