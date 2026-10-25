import { useRef, useState } from "react";
import { db } from "@/lib/db/db";
import { useAppStore } from "@/store/useAppStore";
import Modal from "@/components/common/Modal";
import { PlaylistExporter, ExportCancelled, type ExportProgress } from "@/lib/ffmpeg/exporter";
import type { Clip, Playlist } from "@/types";
import { Download, Loader2, X } from "lucide-react";

export default function ExportDialog({
  projectId,
  playlist,
  clips,
  onClose,
}: {
  projectId: string;
  playlist: Playlist;
  clips: Clip[];
  onClose: () => void;
}) {
  const videoFile = useAppStore((s) => s.videoFile);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const exporterRef = useRef<PlaylistExporter | null>(null);

  async function handleStart() {
    if (!videoFile) {
      setError("Video nie je otvorené v appke – otvor ho znova pred exportom.");
      return;
    }
    setError(null);
    setResultBlob(null);
    setProgress({ fraction: 0, label: "Pripravujem export..." });

    const [drawings, tagEvents, tagTypes, players] = await Promise.all([
      db.drawings.where("projectId").equals(projectId).toArray(),
      db.tagEvents.where("projectId").equals(projectId).toArray(),
      db.tagTypes.where("projectId").equals(projectId).toArray(),
      db.players.where("projectId").equals(projectId).toArray(),
    ]);

    const exporter = new PlaylistExporter();
    exporterRef.current = exporter;
    try {
      const blob = await exporter.run({ videoFile, clips, drawings, tagEvents, tagTypes, players }, setProgress);
      setResultBlob(blob);
    } catch (e) {
      if (e instanceof ExportCancelled) {
        setProgress(null);
      } else {
        console.error(e);
        setError(e instanceof Error ? e.message : "Export zlyhal.");
        setProgress(null);
      }
    }
  }

  function handleCancel() {
    exporterRef.current?.cancel();
  }

  function handleDownload() {
    if (!resultBlob) return;
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${playlist.name.replace(/[^a-z0-9_-]+/gi, "_")}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const isRunning = progress !== null && progress.fraction < 1 && !resultBlob;

  return (
    <Modal title={`Export: ${playlist.name}`} onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          Exportuje {clips.length} klip(y) do jedného MP4 (720p, H.264/AAC). Kresby sa vypália ako freeze-frame
          s titulkom na začiatku každého klipu. Pri väčšom počte klipov/kresieb export môže chvíľu trvať.
        </p>

        {!videoFile && (
          <p className="text-sm text-amber-400">
            Video súbor nie je aktuálne pripojené (po reloade stránky treba video znova otvoriť), export zatiaľ nepôjde.
          </p>
        )}

        {progress && (
          <div className="space-y-1.5">
            <div className="h-2.5 w-full rounded-full bg-pitch-900 overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all"
                style={{ width: `${Math.round(progress.fraction * 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">{progress.label} ({Math.round(progress.fraction * 100)}%)</p>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {resultBlob && (
          <div className="rounded-md border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm text-emerald-300">
            Export hotový! Veľkosť: {(resultBlob.size / 1024 / 1024).toFixed(1)} MB
          </div>
        )}

        <div className="flex justify-end gap-2">
          {isRunning ? (
            <button className="btn-danger" onClick={handleCancel}>
              <X size={15} /> Zrušiť export
            </button>
          ) : resultBlob ? (
            <>
              <button className="btn-ghost" onClick={onClose}>Zavrieť</button>
              <button className="btn-primary" onClick={handleDownload}>
                <Download size={15} /> Stiahnuť MP4
              </button>
            </>
          ) : (
            <>
              <button className="btn-ghost" onClick={onClose}>Zrušiť</button>
              <button className="btn-primary" disabled={!videoFile} onClick={handleStart}>
                <Loader2 size={15} className={progress ? "animate-spin" : "hidden"} /> Spustiť export
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
