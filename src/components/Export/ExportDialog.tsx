import { useRef, useState } from "react";
import { db } from "@/lib/db/db";
import { useAppStore } from "@/store/useAppStore";
import { formatTime } from "@/lib/utils/time";
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
  const duration = useAppStore((s) => s.duration);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const exporterRef = useRef<PlaylistExporter | null>(null);
  const fileName = `${playlist.name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "export"}.mp4`;

  function download(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // okamžité revokeObjectURL preruší Chromu sťahovanie väčšieho súboru
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function handleStart() {
    if (!videoFile) {
      setError("Video nie je otvorené v appke – otvor ho znova pred exportom.");
      return;
    }
    const outside = clips.find((c) => duration > 0 && c.inPoint >= duration - 0.1);
    if (outside) {
      setError(
        `Klip „${outside.name}“ začína v ${formatTime(outside.inPoint)}, ale otvorené video má len ${formatTime(duration)}. Otvor video celého zápasu (Zmeniť video) a spusti export znova.`
      );
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
      download(blob);
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

  const isRunning = progress !== null && progress.fraction < 1 && !resultBlob;

  return (
    <Modal title={`Export: ${playlist.name}`} onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          Exportuje {clips.length} klip(y) do jedného MP4 (720p, H.264/AAC) s titulkom na začiatku každého klipu.
          Freeze kresby zastavia obraz, pohyblivé kresby sa vypália do pohybu. Export beží v prehliadači a trvá
          zhruba 1–2× dĺžku klipov.
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
            Export hotový ({(resultBlob.size / 1024 / 1024).toFixed(1)} MB) a stiahnutý ako <b>{fileName}</b> do priečinka
            pre stiahnuté súbory (v Chrome ich otvoríš cez Ctrl+J). Ak sa stiahnutie nespustilo, klikni na Stiahnuť MP4.
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
              <button className="btn-primary" onClick={() => download(resultBlob)}>
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
