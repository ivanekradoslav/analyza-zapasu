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

const TOOLS: { kind: DrawTool; label: string; icon: React.ReactNode }[] = [
  { kind: "move", label: "Presunúť (chyť tvar alebo jeho bod)", icon: <Move size={16} /> },
  { kind: "arrow", label: "Šípka", icon: <ArrowUpRight size={16} /> },
  { kind: "line", label: "Čiara", icon: <Minus size={16} /> },
  { kind: "dashedLine", label: "Prerušovaná (beh)", icon: <MoreHorizontal size={16} /> },
  { kind: "ellipse", label: "Kruh (hráč)", icon: <Circle size={16} /> },
  { kind: "polyline", label: "Línia (spojnica)", icon: <Spline size={16} /> },
  { kind: "zone", label: "Zóna", icon: <Hexagon size={16} /> },
  { kind: "text", label: "Text", icon: <Type size={16} /> },
];

const COLORS = ["#ef4444", "#3b82f6", "#eab308", "#22c55e", "#ffffff", "#a855f7", "#f97316"];
const STEPS = [-1, -0.2, 0.2, 1];

export function formatKeyTime(t: number) {
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

const divider = <div className="mx-1 h-6 w-px bg-white/10" />;

export default function DrawingToolbar(props: Props) {
  const isTrack = props.mode === "track";
  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      {props.hint && <div className="rounded bg-black/75 px-2.5 py-1 text-center text-xs text-gray-200">{props.hint}</div>}

      {isTrack && (
        <div className="card flex flex-wrap items-center justify-center gap-1 p-1.5 shadow-xl text-xs">
          <span className="px-1 text-gray-400">Kľúčové body:</span>
          {props.keyframeTimes.length === 0 && <span className="px-1 text-gray-500">zatiaľ žiadne — nakresli tvar</span>}
          {props.keyframeTimes.map((t, i) => (
            <button
              key={t}
              onClick={() => props.onSeek(t)}
              className={clsx(
                "rounded px-1.5 py-0.5 tabular-nums",
                i === props.activeKeyframeIndex ? "bg-amber-500 text-black" : "bg-pitch-900 text-gray-200 hover:bg-pitch-700"
              )}
              title="Skočiť na kľúčový bod"
            >
              {formatKeyTime(t)}
            </button>
          ))}
          {divider}
          {STEPS.map((d) => (
            <button key={d} className="rounded bg-pitch-900 px-1.5 py-0.5 text-gray-200 hover:bg-pitch-700" onClick={() => props.onStep(d)}>
              {d > 0 ? `+${d}s` : `${d}s`}
            </button>
          ))}
          {divider}
          <button
            className="rounded px-1.5 py-0.5 text-gray-200 hover:bg-white/10 disabled:opacity-30"
            disabled={props.activeKeyframeIndex < 0}
            onClick={props.onDeleteKeyframe}
            title="Zmazať kľúčový bod na aktuálnom čase"
          >
            Zmazať bod
          </button>
          <button
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-emerald-300 hover:bg-white/10 disabled:opacity-30"
            disabled={props.keyframeTimes.length < 2}
            onClick={props.onPreview}
            title="Prehrať pohyb od prvého kľúčového bodu"
          >
            <Play size={12} /> Náhľad
          </button>
        </div>
      )}

      <div className="card flex flex-wrap items-center justify-center gap-1 p-1.5 shadow-xl">
        <div className="flex rounded-md bg-pitch-900 p-0.5 text-xs">
          {(["freeze", "track"] as const).map((m) => (
            <button
              key={m}
              className={clsx("rounded px-2 py-1", props.mode === m ? "bg-emerald-600 text-white" : "text-gray-400 hover:text-gray-200")}
              onClick={() => props.onModeChange(m)}
              title={m === "freeze" ? "Video sa zastaví a ukáže kresbu" : "Kresba sa pohybuje s hráčmi počas prehrávania"}
            >
              {m === "freeze" ? "Freeze" : "Pohyblivá"}
            </button>
          ))}
        </div>

        {divider}

        {TOOLS.map((t) => (
          <button
            key={t.kind}
            title={t.label}
            className={clsx(
              "rounded p-1.5 transition-colors",
              props.activeTool === t.kind ? "bg-emerald-600 text-white" : "text-gray-300 hover:bg-white/10"
            )}
            onClick={() => props.onToolChange(t.kind)}
          >
            {t.icon}
          </button>
        ))}

        {divider}

        {COLORS.map((c) => (
          <button
            key={c}
            title={c}
            onClick={() => props.onColorChange(c)}
            className={clsx("h-6 w-6 rounded-full border-2", props.color === c ? "border-white" : "border-transparent")}
            style={{ backgroundColor: c }}
          />
        ))}

        {divider}

        <input
          type="range"
          min={1}
          max={8}
          value={props.strokeWidth}
          onChange={(e) => props.onStrokeWidthChange(Number(e.target.value))}
          className="w-16"
          title="Hrúbka čiary"
        />

        {divider}

        <button className="rounded p-1.5 text-gray-300 hover:bg-white/10 disabled:opacity-30" disabled={!props.canUndo} onClick={props.onUndo} title="Späť">
          <Undo2 size={16} />
        </button>
        <button className="rounded p-1.5 text-gray-300 hover:bg-white/10 disabled:opacity-30" disabled={!props.canRedo} onClick={props.onRedo} title="Dopredu">
          <Redo2 size={16} />
        </button>
        <button
          className="rounded p-1.5 text-gray-300 hover:bg-white/10 disabled:opacity-30"
          disabled={!props.hasSelection}
          onClick={props.onDeleteSelected}
          title="Zmazať vybraný tvar (Delete)"
        >
          <Eraser size={16} />
        </button>
        <button className="rounded p-1.5 text-gray-300 hover:bg-white/10" onClick={props.onClear} title="Vymazať všetko">
          <Trash2 size={16} />
        </button>

        {divider}

        <label className="flex items-center gap-1 text-xs text-gray-400" title={isTrack ? "Ako dlho kresba zostane po poslednom kľúčovom bode" : "Ako dlho bude video zastavené"}>
          <span>{isTrack ? "Držať" : "Freeze"}</span>
          <input
            type="number"
            min={isTrack ? 0 : 1}
            max={15}
            step={isTrack ? 0.5 : 1}
            value={props.durationSec}
            onChange={(e) => props.onDurationChange(Number(e.target.value))}
            className="w-12 rounded bg-pitch-900 px-1 py-0.5 text-gray-100"
          />
          <span>s</span>
        </label>

        {divider}

        <button className="btn-primary px-2.5 py-1" onClick={props.onSave} title="Uložiť kresbu">
          <Check size={15} /> Uložiť
        </button>
        <button className="btn-ghost px-2.5 py-1" onClick={props.onCancel} title="Zrušiť">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
