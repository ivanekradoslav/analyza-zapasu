import { create } from "zustand";
import type { Clip, DrawTool, Team } from "@/types";

export type SidebarTab = "tagy" | "klipy" | "statistiky" | "supiska";

interface AppState {
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;

  videoUrl: string | null;
  videoFileName: string | null;
  videoFile: File | null;
  setVideo: (url: string | null, fileName: string | null, file?: File | null) => void;

  videoEl: HTMLVideoElement | null;
  setVideoEl: (el: HTMLVideoElement | null) => void;

  // Stav prehrávania (zrkadlí <video>, aktualizuje VideoPlayer)
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRate: number;
  setPlaybackState: (patch: Partial<Pick<AppState, "currentTime" | "duration" | "isPlaying" | "playbackRate">>) => void;

  // Tagovanie
  activeTeam: Team;
  toggleActiveTeam: () => void;
  activePlayerId: string | null;
  setActivePlayerId: (id: string | null) => void;
  activeHalf: 1 | 2;
  setActiveHalf: (h: 1 | 2) => void;

  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;

  // Kreslenie
  isDrawingMode: boolean;
  setDrawingMode: (v: boolean) => void;
  activeShapeTool: DrawTool;
  setActiveShapeTool: (tool: DrawTool) => void;
  activeDrawColor: string;
  setActiveDrawColor: (c: string) => void;
  activeStrokeWidth: number;
  setActiveStrokeWidth: (w: number) => void;

  // Freeze-frame prehrávanie kresieb
  frozenDrawingId: string | null;
  setFrozenDrawingId: (id: string | null) => void;

  seekRequest: number | null; // nastavením sa VideoPlayer presunie na čas
  requestSeek: (t: number) => void;
  clearSeekRequest: () => void;

  // Prehrávanie klipu/playlistu (sekvencia úsekov videa)
  playQueue: Clip[] | null;
  playQueueIndex: number;
  startPlayQueue: (clips: Clip[]) => void;
  advancePlayQueue: () => void;
  stopPlayQueue: () => void;

  // I/O body pre manuálny klip
  ioIn: number | null;
  ioOut: number | null;
  setIoIn: (t: number | null) => void;
  setIoOut: (t: number | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentProjectId: null,
  setCurrentProjectId: (id) => set({ currentProjectId: id, videoUrl: null, videoFileName: null }),

  videoUrl: null,
  videoFileName: null,
  videoFile: null,
  setVideo: (url, fileName, file) => set({ videoUrl: url, videoFileName: fileName, videoFile: file ?? null }),

  videoEl: null,
  setVideoEl: (el) => set({ videoEl: el }),

  currentTime: 0,
  duration: 0,
  isPlaying: false,
  playbackRate: 1,
  setPlaybackState: (patch) => set(patch),

  activeTeam: "my",
  toggleActiveTeam: () => set((s) => ({ activeTeam: s.activeTeam === "my" ? "opponent" : "my" })),
  activePlayerId: null,
  setActivePlayerId: (id) => set({ activePlayerId: id }),
  activeHalf: 1,
  setActiveHalf: (h) => set({ activeHalf: h }),

  sidebarTab: "tagy",
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  isDrawingMode: false,
  setDrawingMode: (v) => set({ isDrawingMode: v }),
  activeShapeTool: "arrow",
  setActiveShapeTool: (tool) => set({ activeShapeTool: tool }),
  activeDrawColor: "#ef4444",
  setActiveDrawColor: (c) => set({ activeDrawColor: c }),
  activeStrokeWidth: 3,
  setActiveStrokeWidth: (w) => set({ activeStrokeWidth: w }),

  frozenDrawingId: null,
  setFrozenDrawingId: (id) => set({ frozenDrawingId: id }),

  seekRequest: null,
  requestSeek: (t) => set({ seekRequest: t }),
  clearSeekRequest: () => set({ seekRequest: null }),

  playQueue: null,
  playQueueIndex: 0,
  startPlayQueue: (clips) => set({ playQueue: clips, playQueueIndex: 0, seekRequest: clips[0]?.inPoint ?? null }),
  advancePlayQueue: () =>
    set((s) => {
      if (!s.playQueue) return {};
      const next = s.playQueueIndex + 1;
      if (next >= s.playQueue.length) return { playQueue: null, playQueueIndex: 0 };
      return { playQueueIndex: next, seekRequest: s.playQueue[next].inPoint };
    }),
  stopPlayQueue: () => set({ playQueue: null, playQueueIndex: 0 }),

  ioIn: null,
  ioOut: null,
  setIoIn: (t) => set({ ioIn: t }),
  setIoOut: (t) => set({ ioOut: t }),
}));
