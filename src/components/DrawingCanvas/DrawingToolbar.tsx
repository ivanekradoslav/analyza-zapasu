import type { ShapeKind } from "@/types";
import {
  ArrowUpRight,
  Minus,
  MoreHorizontal,
  Circle,
  Spline,
  Hexagon,
  Type,
  Undo2,
  Redo2,
  Trash2,
  Check,
  X,
} from "lucide-react";
import clsx from "clsx";

const TOOLS: { kind: ShapeKind; label: string; icon: React.ReactNode }[] = [
  { kind: "arrow", label: "Šípka", icon: <ArrowUpRight size={16} /> },
  { kind: "line", label: "Čiara", icon: <Minus size={16} /> },
  { kind: "dashedLine", label: "Prerušovaná (beh)", icon: <MoreHorizontal size={16} /> },
  { kind: "ellipse", label: "Kruh (hráč)", icon: <Circle size={16} /> },
  { kind: "polyline", label: "Línia (spojnica)", icon: <Spline size={16} /> },
  { kind: "zone", label: "Zóna", icon: <Hexagon size={16} /> },
  { kind: "text", label: "Text", icon: <Type size={16} /> },
];

const COLORS = ["#ef4444", "#3b82f6", "#eab308", "#22c55e", "#ffffff", "#a855f7", "#f97316"];

interface Props {
  activeTool: ShapeKind;
  onToolChange: (t: ShapeKind) => void;
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
  onSave: () => void;
  onCancel: () => void;
  hint?: string;
}

export default function DrawingToolbar(props: Props) {
  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
      {props.hint && (
        <div className="rounded bg-black/70 px-2.5 py-1 text-xs text-gray-200">{props.hint}</div>
      )}
      <div className="card flex items-center gap-1 p-1.5 shadow-xl">
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

        <div className="mx-1 h-6 w-px bg-white/10" />

        {COLORS.map((c) => (
          <button
            key={c}
            title={c}
            onClick={() => props.onColorChange(c)}
            className={clsx(
              "h-6 w-6 rounded-full border-2",
              props.color === c ? "border-white" : "border-transparent"
            )}
            style={{ backgroundColor: c }}
          />
        ))}

        <div className="mx-1 h-6 w-px bg-white/10" />

        <input
          type="range"
          min={1}
          max={8}
          value={props.strokeWidth}
          onChange={(e) => props.onStrokeWidthChange(Number(e.target.value))}
          className="w-16"
          title="Hrúbka čiary"
        />

        <div className="mx-1 h-6 w-px bg-white/10" />

        <button className="rounded p-1.5 text-gray-300 hover:bg-white/10 disabled:opacity-30" disabled={!props.canUndo} onClick={props.onUndo} title="Späť">
          <Undo2 size={16} />
        </button>
        <button className="rounded p-1.5 text-gray-300 hover:bg-white/10 disabled:opacity-30" disabled={!props.canRedo} onClick={props.onRedo} title="Dopredu">
          <Redo2 size={16} />
        </button>
        <button className="rounded p-1.5 text-gray-300 hover:bg-white/10" onClick={props.onClear} title="Vymazať všetko">
          <Trash2 size={16} />
        </button>

        <div className="mx-1 h-6 w-px bg-white/10" />

        <div className="flex items-center gap-1 text-xs text-gray-400">
          <span>Freeze</span>
          <input
            type="number"
            min={1}
            max={15}
            value={props.durationSec}
            onChange={(e) => props.onDurationChange(Number(e.target.value))}
            className="w-12 rounded bg-pitch-900 px-1 py-0.5 text-gray-100"
          />
          <span>s</span>
        </div>

        <div className="mx-1 h-6 w-px bg-white/10" />

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
