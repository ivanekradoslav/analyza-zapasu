import type { DrawTool, DrawingMode } from "@/types";
import {
  ArrowUpRight,
  Minus,
  MoreHorizontal,
  Circle,
  Spline,
  Hexagon,
  Type,
  Move,
  Undo2,
  Redo2,
  Trash2,
  Check,
  X,
  Eraser,
  Play,
} from "lucide-react";
import clsx from "clsx";

const TOOLS: { kind: DrawTool; label: string; title: string; icon: React.ReactNode }[] = [
  { kind: "move", label: "Presunúť", title: "Chyť tvar alebo jeho bod a potiahni", icon: <Move size={18} /> },
  { kind: "arrow", label: "Šípka", title: "Šípka", icon: <ArrowUpRight size={18} /> },
  { kind: "line", label: "Čiara", title: "Čiara", icon: <Minus size={18} /> },
  { kind: "dashedLine", label: "Beh", title: "Prerušovaná čiara (beh)", icon: <MoreHorizontal size={18} /> },
  { kind: "ellipse", label: "Kruh", title: "Kruh pod hráča", icon: <Circle size={18} /> },
  { kind: "polyline", label: "Línia", title: "Spojnica hráčov (napr. línia obrany)", icon: <Spline size={18} /> },
  { kind: "zone", label: "Zóna", title: "Zóna", icon: <Hexagon size={18} /> },
  { kind: "text", label: "Text", title: "Text", icon: <Type size={18} /> },
];

const COLORS = ["#ef4444", "#3b82f6", "#eab308", "#22c55e", "#ffffff", "#a855f7", "#f97316"];
const STEPS = [-1, -0.2, 0.2, 1];

function formatKeyTime(t: number) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

interface Props {
  mode: DrawingMode;
  onModeChange: (m: DrawingMode) => void;
  activeTool: DrawTool;
  onToolChange: (t: DrawTool) => void;
  color: string;
  onColorChange: (c: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (w: number) => void;
  durationSec: number;
  onDurationChange: (d: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  hasSelection: boolean;
  onDeleteSelected: () => void;
  onSave: () => void;
  onCancel: () => void;
  hint?: string;
  keyframeTimes: number[];
  activeKeyframeIndex: number;
  onSeek: (t: number) => void;
  onStep: (delta: number) => void;
  onDeleteKeyframe: () => void;
  onPreview: () => void;
}

const sectionTitle = "text-xs font-semibold uppercase tracking-wide text-gray-400";
const smallBtn = "flex items-center justify-center gap-1 rounded-md bg-pitch-900 px-2 py-1.5 text-xs text-gray-200 hover:bg-pitch-700 disabled:opacity-30 disabled:hover:bg-pitch-900";

export default function DrawingToolbar(props: Props) {
  const isTrack = props.mode === "track";
  return (
    <div className="flex flex-col gap-3">
      <div className="card p-3 space-y-2">
        <h3 className={sectionTitle}>Kreslenie</h3>
        <div className="grid grid-cols-2 rounded-md bg-pitch-900 p-0.5 text-sm">
          {(["freeze", "track"] as const).map((m) => (
            <button
              key={m}
              className={clsx("rounded px-2 py-1.5", props.mode === m ? "bg-emerald-600 text-white" : "text-gray-400 hover:text-gray-200")}
              onClick={() => props.onModeChange(m)}
            >
              {m === "freeze" ? "Freeze" : "Pohyblivá"}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          {isTrack ? "Kresba ide s hráčmi počas prehrávania." : "Video sa na tomto čase zastaví a ukáže kresbu."}
        </p>
        {props.hint && <p className="rounded bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">{props.hint}</p>}
      </div>

      <div className="card p-3 space-y-3">
        <div className="grid grid-cols-4 gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.kind}
              title={t.title}
              className={clsx(
                "flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] transition-colors",
                props.activeTool === t.kind ? "bg-emerald-600 text-white" : "bg-pitch-900 text-gray-300 hover:bg-pitch-700"
              )}
              onClick={() => props.onToolChange(t.kind)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          {COLORS.map((c) => (
            <button
              key={c}
              title={c}
              onClick={() => props.onColorChange(c)}
              className={clsx("h-7 w-7 rounded-full border-2", props.color === c ? "border-white" : "border-transparent")}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-400">
          Hrúbka
          <input
            type="range"
            min={1}
            max={8}
            value={props.strokeWidth}
            onChange={(e) => props.onStrokeWidthChange(Number(e.target.value))}
            className="flex-1"
          />
        </label>

        <div className="grid grid-cols-4 gap-1">
          <button className={smallBtn} disabled={!props.canUndo} onClick={props.onUndo} title="Späť">
            <Undo2 size={14} /> Späť
          </button>
          <button className={smallBtn} disabled={!props.canRedo} onClick={props.onRedo} title="Dopredu">
            <Redo2 size={14} />
          </button>
          <button className={smallBtn} disabled={!props.hasSelection} onClick={props.onDeleteSelected} title="Zmazať vybraný tvar (Delete)">
            <Eraser size={14} /> Tvar
          </button>
          <button className={smallBtn} onClick={props.onClear} title="Vymazať všetky tvary">
            <Trash2 size={14} /> Všetko
          </button>
        </div>
      </div>

      {isTrack && (
        <div className="card p-3 space-y-2">
          <h3 className={sectionTitle}>Kľúčové body</h3>
          <div className="flex flex-wrap gap-1">
            {props.keyframeTimes.length === 0 && <span className="text-xs text-gray-500">Zatiaľ žiadne — nakresli tvar.</span>}
            {props.keyframeTimes.map((t, i) => (
              <button
                key={t}
                onClick={() => props.onSeek(t)}
                className={clsx(
                  "rounded px-1.5 py-0.5 text-xs tabular-nums",
                  i === props.activeKeyframeIndex ? "bg-amber-500 text-black" : "bg-pitch-900 text-gray-200 hover:bg-pitch-700"
                )}
                title="Skočiť na kľúčový bod"
              >
                {formatKeyTime(t)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {STEPS.map((d) => (
              <button key={d} className={smallBtn} onClick={() => props.onStep(d)} title="Posunúť video">
                {d > 0 ? `+${d}s` : `${d}s`}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button className={smallBtn} disabled={props.activeKeyframeIndex < 0} onClick={props.onDeleteKeyframe} title="Zmazať kľúčový bod na aktuálnom čase">
              Zmazať bod
            </button>
            <button className={clsx(smallBtn, "text-emerald-300")} disabled={props.keyframeTimes.length < 2} onClick={props.onPreview} title="Prehrať pohyb od prvého kľúčového bodu">
              <Play size={13} /> Náhľad
            </button>
          </div>
        </div>
      )}

      <div className="card p-3 space-y-3">
        <label className="flex items-center gap-2 text-sm text-gray-300">
          {isTrack ? "Držať po poslednom bode" : "Dĺžka zastavenia"}
          <input
            type="number"
            min={isTrack ? 0 : 1}
            max={15}
            step={isTrack ? 0.5 : 1}
            value={props.durationSec}
            onChange={(e) => props.onDurationChange(Number(e.target.value))}
            className="input w-16"
          />
          s
        </label>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={props.onSave}>
            <Check size={15} /> Uložiť kresbu
          </button>
          <button className="btn-secondary" onClick={props.onCancel} title="Zavrieť bez uloženia">
            <X size={15} /> Zrušiť
          </button>
        </div>
      </div>
    </div>
  );
}
