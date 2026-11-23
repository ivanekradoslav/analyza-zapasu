import type { DrawTool, DrawingMode, PitchCalibration, Player } from "@/types";
import { PITCH_PRESETS } from "@/lib/drawing/pitch";
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
  Flashlight,
  Flag,
  Ruler,
  Grid3x3,
  Footprints,
} from "lucide-react";
import clsx from "clsx";

// nástroje, ktoré potrebujú nastavené ihrisko (perspektívu)
const NEEDS_PITCH: DrawTool[] = ["measure"];

const TOOLS: { kind: DrawTool; label: string; title: string; icon: React.ReactNode }[] = [
  { kind: "move", label: "Presunúť", title: "Chyť tvar alebo jeho bod a potiahni", icon: <Move size={18} /> },
  { kind: "arrow", label: "Šípka", title: "Šípka", icon: <ArrowUpRight size={18} /> },
  { kind: "line", label: "Čiara", title: "Čiara", icon: <Minus size={18} /> },
  { kind: "dashedLine", label: "Beh", title: "Prerušovaná čiara (beh)", icon: <MoreHorizontal size={18} /> },
  { kind: "spotlight", label: "Svetlo", title: "Svetelný stĺp nad hráčom so štítkom", icon: <Flashlight size={18} /> },
  { kind: "ellipse", label: "Kruh", title: "Kruh pod hráča", icon: <Circle size={18} /> },
  { kind: "movePlayer", label: "Pohyb", title: "Pohyb hráča: odkiaľ → kam mal ísť (pri prehrávaní sa presunie)", icon: <Footprints size={18} /> },
  { kind: "polyline", label: "Línia", title: "Spojnica hráčov (napr. línia obrany)", icon: <Spline size={18} /> },
  { kind: "zone", label: "Zóna", title: "Zóna", icon: <Hexagon size={18} /> },
  { kind: "text", label: "Text", title: "Text", icon: <Type size={18} /> },
  { kind: "offsideLine", label: "Ofsajd", title: "Čiara cez celé ihrisko rovnobežne s bránkovou čiarou", icon: <Flag size={18} /> },
  { kind: "measure", label: "Meter", title: "Vzdialenosť dvoch bodov v metroch (potrebuje presné ihrisko – 4 body)", icon: <Ruler size={18} /> },
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
  labelEditor: { forSelected: boolean } | null;
  labelDraft: string;
  onLabelDraftChange: (text: string) => void;
  onLabelCommit: () => void;
  players: Player[];
  onPickPlayer: (id: string) => void;
  // ihrisko 3D
  calibration: PitchCalibration | null;
  calibrating: boolean;
  onStartCalibration: () => void;
  onFinishCalibration: () => void;
  onCancelCalibration: () => void;
  onRemoveCalibration: () => void;
  onCalibrationDims: (patch: Partial<Pick<PitchCalibration, "widthM" | "depthM" | "presetId">>) => void;
  drawOnGround: boolean;
  onDrawOnGroundChange: (v: boolean) => void;
  lineDistances: boolean;
  onLineDistancesChange: (v: boolean) => void;
  cameraTilt: number;
  onCameraTiltChange: (t: number) => void;
}

function formatDim(n: number) {
  return n.toString().replace(".", ",");
}

function PitchCard(props: Props) {
  const c = props.calibration;
  if (props.calibrating && c) {
    const preset = PITCH_PRESETS.find((p) => p.id === c.presetId) ?? PITCH_PRESETS[PITCH_PRESETS.length - 1];
    return (
      <div className="card p-3 space-y-2 ring-1 ring-amber-400/60">
        <h3 className={sectionTitle}>Nastavenie ihriska</h3>
        <p className="text-xs text-gray-300">
          Potiahni biele body <b>1</b> a <b>2</b> na rohy pri <b>bránkovej čiare</b>, žlté <b>3</b> a <b>4</b> na protiľahlé rohy.
          Keď žltá mriežka sedí na čiarach trávnika, je to správne.
        </p>
        <select
          className="input"
          value={preset.id}
          onChange={(e) => {
            const p = PITCH_PRESETS.find((x) => x.id === e.target.value);
            if (p) props.onCalibrationDims({ presetId: p.id, widthM: p.widthM, depthM: p.depthM });
          }}
        >
          {PITCH_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
          <label className="space-y-0.5">
            <span>Šírka 1→2 (m)</span>
            <input
              type="number"
              step={0.1}
              min={1}
              className="input"
              value={c.widthM}
              onChange={(e) => props.onCalibrationDims({ widthM: Number(e.target.value), presetId: "custom" })}
            />
          </label>
          <label className="space-y-0.5">
            <span>Hĺbka 2→3 (m)</span>
            <input
              type="number"
              step={0.1}
              min={1}
              className="input"
              value={c.depthM}
              onChange={(e) => props.onCalibrationDims({ depthM: Number(e.target.value), presetId: "custom" })}
            />
          </label>
        </div>
        <p className="text-[11px] text-gray-500">Pri žiackych ihriskách sú územia menšie — rozmery si zmeraj alebo uprav.</p>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={props.onFinishCalibration}>
            <Check size={15} /> Hotovo
          </button>
          <button className="btn-secondary" onClick={props.onCancelCalibration}>
            Zrušiť
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="card p-3 space-y-2">
      <h3 className={sectionTitle}>Kreslenie na trávu</h3>
      <label className="flex items-center gap-2 text-sm text-gray-200">
        <input type="checkbox" checked={props.drawOnGround} onChange={(e) => props.onDrawOnGroundChange(e.target.checked)} />
        Kruhy, svetlo a šípky ležia na tráve
      </label>
      {c ? (
        <>
          <p className="text-xs text-gray-400">
            Presné ihrisko podľa obdĺžnika {formatDim(c.widthM)} × {formatDim(c.depthM)} m — funguje meranie v metroch.
          </p>
          <label className="flex items-center gap-2 text-sm text-gray-200">
            <input type="checkbox" checked={props.lineDistances} onChange={(e) => props.onLineDistancesChange(e.target.checked)} />
            Línia: vzdialenosti medzi hráčmi
          </label>
          <div className="grid grid-cols-2 gap-1">
            <button className={smallBtn} onClick={props.onStartCalibration}>
              <Grid3x3 size={13} /> Upraviť body
            </button>
            <button className={smallBtn} onClick={props.onRemoveCalibration}>
              <X size={13} /> Späť na automatickú
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="block space-y-1 text-xs text-gray-400">
            <span className="flex justify-between">
              <span>Uhol kamery</span>
              <span className="text-gray-500">platí pre celý zápas</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={props.cameraTilt}
              onChange={(e) => props.onCameraTiltChange(Number(e.target.value))}
              className="w-full"
            />
            <span className="flex justify-between text-[11px] text-gray-500">
              <span>zhora</span>
              <span>zboku</span>
            </span>
          </label>
          <p className="text-[11px] text-gray-500">
            Nakresli kruh pod hráča vpredu aj vzadu a posuvníkom dolaď, kým nesedia na tráve.
          </p>
          <button className={clsx(smallBtn, "w-full")} onClick={props.onStartCalibration} title="Prilož 4 rohy šestnástky – potom funguje meranie v metroch">
            <Grid3x3 size={13} /> Presné metre (4 body ihriska)
          </button>
        </>
      )}
    </div>
  );
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

      <PitchCard {...props} />

      <div className="card p-3 space-y-3">
        <div className="grid grid-cols-4 gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.kind}
              title={t.title}
              disabled={NEEDS_PITCH.includes(t.kind) && !props.calibration}
              className={clsx(
                "flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] transition-colors disabled:opacity-30",
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

      {props.labelEditor && (
        <div className="card p-3 space-y-2">
          <h3 className={sectionTitle}>Štítok pod hráčom</h3>
          {props.players.length > 0 && (
            <select className="input" value="" onChange={(e) => e.target.value && props.onPickPlayer(e.target.value)}>
              <option value="">Vybrať zo súpisky…</option>
              {props.players.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {p.name}
                </option>
              ))}
            </select>
          )}
          <input
            className="input"
            placeholder="napr. #14 alebo meno (prázdne = bez štítku)"
            value={props.labelDraft}
            onChange={(e) => props.onLabelDraftChange(e.target.value)}
            onBlur={props.onLabelCommit}
            onKeyDown={(e) => e.key === "Enter" && props.onLabelCommit()}
          />
          <p className="text-xs text-gray-500">
            {props.labelEditor.forSelected ? "Mení štítok vybraného svetla." : "Použije sa pri ďalšom nakreslenom svetle."}
          </p>
        </div>
      )}

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
