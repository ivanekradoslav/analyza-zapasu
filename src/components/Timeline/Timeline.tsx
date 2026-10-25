import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import { useAppStore } from "@/store/useAppStore";
import { formatTime } from "@/lib/utils/time";
import { useMemo, useRef } from "react";
import type { TagType } from "@/types";

export default function Timeline({ projectId }: { projectId: string }) {
  const duration = useAppStore((s) => s.duration);
  const currentTime = useAppStore((s) => s.currentTime);
  const requestSeek = useAppStore((s) => s.requestSeek);
  const trackRef = useRef<HTMLDivElement>(null);

  const tagEvents = useLiveQuery(() => db.tagEvents.where("projectId").equals(projectId).toArray(), [projectId], []);
  const tagTypes = useLiveQuery(() => db.tagTypes.where("projectId").equals(projectId).toArray(), [projectId], []);
  const drawings = useLiveQuery(() => db.drawings.where("projectId").equals(projectId).toArray(), [projectId], []);

  const tagTypeMap = useMemo(() => {
    const m = new Map<string, TagType>();
    tagTypes?.forEach((t) => m.set(t.id, t));
    return m;
  }, [tagTypes]);

  function handleTrackClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!trackRef.current || !duration) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    requestSeek(ratio * duration);
  }

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="card px-3 py-2.5 select-none">
      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
        <span>00:00</span>
        <span>{formatTime(duration)}</span>
      </div>
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        className="relative h-9 rounded bg-pitch-900 cursor-pointer border border-white/5"
      >
        {duration > 0 &&
          tagEvents?.map((ev) => {
            const type = tagTypeMap.get(ev.tagTypeId);
            const pct = (ev.timestamp / duration) * 100;
            return (
              <div
                key={ev.id}
                title={`${type?.name ?? "tag"} · ${formatTime(ev.timestamp)}`}
                className="absolute top-0.5 bottom-0.5 w-1 rounded-sm hover:w-1.5 transition-all"
                style={{ left: `${pct}%`, backgroundColor: type?.color ?? "#999" }}
                onClick={(e) => {
                  e.stopPropagation();
                  requestSeek(ev.timestamp);
                }}
              />
            );
          })}
        {duration > 0 &&
          drawings?.map((d) => {
            const pct = (d.timestamp / duration) * 100;
            return (
              <div
                key={d.id}
                title={`Kresba · ${formatTime(d.timestamp)}`}
                className="absolute bottom-0 h-2 w-2 -ml-1 rounded-full bg-amber-400 border border-black/40"
                style={{ left: `${pct}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  requestSeek(d.timestamp);
                }}
              />
            );
          })}
        <div
          className="absolute top-0 bottom-0 w-px bg-white"
          style={{ left: `${playheadPct}%` }}
        />
      </div>
    </div>
  );
}
