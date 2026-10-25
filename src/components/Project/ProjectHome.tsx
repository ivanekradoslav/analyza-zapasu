import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import { createProject, deleteProject, exportProjectJson, importProjectJson } from "@/lib/db/operations";
import { useAppStore } from "@/store/useAppStore";
import type { ProjectExport } from "@/types";
import { Trash2, Download, Upload, FolderOpen, Plus } from "lucide-react";

export default function ProjectHome() {
  const projects = useLiveQuery(() => db.projects.orderBy("updatedAt").reverse().toArray(), [], []);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [competition, setCompetition] = useState("");

  async function handleCreate() {
    if (!opponent.trim()) return;
    const project = await createProject({
      name: name.trim() || `vs. ${opponent.trim()}`,
      opponent: opponent.trim(),
      date,
      competition: competition.trim(),
    });
    setShowForm(false);
    setName("");
    setOpponent("");
    setCompetition("");
    setCurrentProjectId(project.id);
  }

  async function handleExport(projectId: string, projectName: string) {
    const data = await exportProjectJson(projectId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.replace(/[^a-z0-9_-]+/gi, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File) {
    const text = await file.text();
    const data = JSON.parse(text) as ProjectExport;
    const id = await importProjectJson(data);
    setCurrentProjectId(id);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-white">Analýza zápasu</h1>
          <p className="text-gray-400 text-sm">Video analýza futbalových zápasov – tagovanie, kreslenie, klipy, export.</p>
        </div>

        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-200">Projekty</h2>
            <div className="flex gap-2">
              <label className="btn-secondary cursor-pointer">
                <Upload size={16} /> Import JSON
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleImportFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
                <Plus size={16} /> Nový projekt
              </button>
            </div>
          </div>

          {showForm && (
            <div className="rounded-md border border-white/10 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Súper *</label>
                  <input className="input" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="FC Súper" />
                </div>
                <div>
                  <label className="label">Dátum</label>
                  <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">Súťaž</label>
                  <input className="input" value={competition} onChange={(e) => setCompetition(e.target.value)} placeholder="Liga, kolo..." />
                </div>
                <div>
                  <label className="label">Názov projektu (voliteľné)</label>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="napr. vs. Súper – 5. kolo" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn-ghost" onClick={() => setShowForm(false)}>Zrušiť</button>
                <button className="btn-primary" disabled={!opponent.trim()} onClick={handleCreate}>Vytvoriť</button>
              </div>
            </div>
          )}

          <div className="divide-y divide-white/5">
            {projects && projects.length === 0 && (
              <p className="text-sm text-gray-500 py-6 text-center">Zatiaľ žiadne projekty. Vytvor nový vyššie.</p>
            )}
            {projects?.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5 group">
                <button className="text-left flex-1" onClick={() => setCurrentProjectId(p.id)}>
                  <div className="font-medium text-gray-100 flex items-center gap-2">
                    <FolderOpen size={15} className="text-emerald-500" /> {p.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {p.date} {p.competition && `· ${p.competition}`}
                  </div>
                </button>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="btn-ghost p-1.5" title="Exportovať JSON" onClick={() => handleExport(p.id, p.name)}>
                    <Download size={15} />
                  </button>
                  <button
                    className="btn-ghost p-1.5 text-red-400"
                    title="Odstrániť projekt"
                    onClick={() => {
                      if (confirm(`Naozaj odstrániť projekt "${p.name}"? Táto akcia je nezvratná.`)) {
                        void deleteProject(p.id);
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
