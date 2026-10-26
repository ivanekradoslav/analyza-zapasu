import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import { useAppStore } from "@/store/useAppStore";
import { addTagEvent } from "@/lib/db/operations";

const FRAME_DURATION = 1 / 25;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

export function useKeyboardShortcuts(projectId: string) {
  const tagTypes = useLiveQuery(() => db.tagTypes.where("projectId").equals(projectId).toArray(), [projectId], []);
  const players = useLiveQuery(() => db.players.where("projectId").equals(projectId).toArray(), [projectId], []);
  const numberBufferRef = useRef("");
  const numberTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      const store = useAppStore.getState();
      const video = store.videoEl;
      const isDrawing = store.isDrawingMode;

      if (e.key === " ") {
        if (isDrawing) return;
        e.preventDefault();
        if (!video) return;
        if (video.paused) void video.play();
        else video.pause();
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (!video) return;
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (!video) return;
        video.currentTime = Math.max(0, video.currentTime - 5);
        return;
      }

      if (e.key === ".") {
        e.preventDefault();
        if (!video) return;
        video.pause();
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + FRAME_DURATION);
        return;
      }
      if (e.key === ",") {
        e.preventDefault();
        if (!video) return;
        video.pause();
        video.currentTime = Math.max(0, video.currentTime - FRAME_DURATION);
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        store.toggleActiveTeam();
        return;
      }

      if (e.key === "Escape") {
        store.setActivePlayerId(null);
        numberBufferRef.current = "";
        return;
      }

      if (e.key.toLowerCase() === "i" && !isDrawing) {
        store.setIoIn(store.currentTime);
        return;
      }
      if (e.key.toLowerCase() === "o" && !isDrawing) {
        store.setIoOut(store.currentTime);
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        numberBufferRef.current += e.key;
        if (numberTimeoutRef.current) window.clearTimeout(numberTimeoutRef.current);
        numberTimeoutRef.current = window.setTimeout(() => {
          const num = Number(numberBufferRef.current);
          numberBufferRef.current = "";
          const player = players?.find((p) => p.number === num);
          if (player) store.setActivePlayerId(player.id);
        }, 500);
        return;
      }

      if (isDrawing) return; // v režime kreslenia sa tagy neukladajú

      const key = e.key.toLowerCase();
      const tagType = tagTypes?.find((t) => t.shortcut === key);
      if (tagType) {
        void addTagEvent({
          projectId,
          tagTypeId: tagType.id,
          team: store.activeTeam,
          playerId: store.activePlayerId ?? undefined,
          timestamp: store.currentTime,
          half: store.activeHalf,
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [projectId, tagTypes, players]);
}
