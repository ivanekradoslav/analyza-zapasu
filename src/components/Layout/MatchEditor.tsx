import Header from "@/components/Layout/Header";
import VideoPlayer from "@/components/VideoPlayer/VideoPlayer";
import Timeline from "@/components/Timeline/Timeline";
import TagList from "@/components/Timeline/TagList";
import TaggingPanel from "@/components/Tagging/TaggingPanel";
import ClipManager from "@/components/Clips/ClipManager";
import PlaylistEditor from "@/components/Clips/PlaylistEditor";
import StatsPanel from "@/components/Stats/StatsPanel";
import RosterEditor from "@/components/Project/RosterEditor";
import { useAppStore, type SidebarTab } from "@/store/useAppStore";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import clsx from "clsx";

const TABS: { id: SidebarTab; label: string }[] = [
  { id: "tagy", label: "Tagovanie" },
  { id: "klipy", label: "Klipy a playlisty" },
  { id: "statistiky", label: "Štatistiky" },
  { id: "supiska", label: "Súpiska" },
];

export default function MatchEditor({ projectId }: { projectId: string }) {
  useKeyboardShortcuts(projectId);
  const sidebarTab = useAppStore((s) => s.sidebarTab);
  const setSidebarTab = useAppStore((s) => s.setSidebarTab);

  return (
    <div className="flex h-screen flex-col">
      <Header projectId={projectId} />
      <div className="flex flex-1 min-h-0 gap-3 p-3">
        <div className="flex flex-col gap-3 flex-[2] min-h-0">
          <VideoPlayer projectId={projectId} />
          <Timeline projectId={projectId} />
          <TagList projectId={projectId} />
        </div>

        <div className="flex flex-col w-[380px] shrink-0 min-h-0">
          <div className="flex gap-1 mb-2 flex-wrap">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setSidebarTab(t.id)}
                className={clsx(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  sidebarTab === t.id ? "bg-emerald-600 text-white" : "bg-pitch-800 text-gray-400 hover:bg-pitch-700"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0">
            {sidebarTab === "tagy" && <TaggingPanel projectId={projectId} />}
            {sidebarTab === "klipy" && (
              <div className="flex flex-col gap-3 h-full overflow-y-auto">
                <ClipManager projectId={projectId} />
                <PlaylistEditor projectId={projectId} />
              </div>
            )}
            {sidebarTab === "statistiky" && <StatsPanel projectId={projectId} />}
            {sidebarTab === "supiska" && <RosterEditor projectId={projectId} />}
          </div>
        </div>
      </div>
    </div>
  );
}
