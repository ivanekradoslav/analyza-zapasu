import { useLiveQuery } from "dexie-react-hooks";
import { useRef } from "react";
import { db } from "@/lib/db/db";
import { useAppStore } from "@/store/useAppStore";
import { exportProjectJson, updateProject } from "@/lib/db/operations";
import { ArrowLeft, FolderUp, Download } from "lucide-react";

export default function Header({ projectId }: { projectId: string }) {
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);
  const setVideo = useAppStore((s) => s.setVideo);
  const videoFileName = useAppStore((s) => s.videoFileName);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleOpenVideo(file: File) {
    const url = URL.createObjectURL(file);
    setVideo(url, file.name, file);
    void updateProject(projectId, { videoFileName: file.name });
  }

  async function handleExport() {
    if (!project) return;
    const data = await exportProjectJson(projectId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9_-]+/gi, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <header className="flex items-center gap-3 border-b border-white/10 bg-pitch-900 px-4 py-2.5">
      <button className="btn-ghost p-2" onClick={() => setCurrentProjectId(null)} title="Späť na projekty">
        <ArrowLeft size={18} />
      </button>
      <div className="min-w-0">
        <div className="font-semibold text-gray-100 truncate">{project?.name ?? "..."}</div>
        <div className="text-xs text-gray-500 truncate">
          {project?.date} {project?.competition && `· ${project.competition}`} {videoFileName && `· ${videoFileName}`}
        </div>
      </div>

      <div className="flex-1" />

      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleOpenVideo(f);
          e.target.value = "";
        }}
      />
      <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
        <FolderUp size={15} /> {videoFileName ? "Zmeniť video" : "Otvoriť video"}
      </button>
      <button className="btn-ghost" onClick={handleExport} title="Exportovať projekt ako JSON">
        <Download size={15} /> JSON
      </button>
    </header>
  );
}
