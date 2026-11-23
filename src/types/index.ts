// Dátový model appky. Všetko sa ukladá do IndexedDB (pozri lib/db/db.ts).
// Video súbor samotný sa NIKDY neukladá do DB (je príliš veľký) - len jeho
// meno, pre pripomenutie, aby si ho užívateľ znova otvoril v rámci projektu.

export type Team = "my" | "opponent";

export type Half = 1 | 2;

export type TagCategory = "phase" | "event" | "press" | "custom";

export interface Project {
  id: string;
  name: string;
  opponent: string;
  date: string; // ISO date (yyyy-mm-dd)
  competition: string;
  videoFileName?: string;
  cameraTilt?: number; // uhol kamery pre automatickú perspektívu kresieb (0 = zhora, 1 = silno zboku)
  createdAt: number;
  updatedAt: number;
}

export interface Player {
  id: string;
  projectId: string;
  name: string;
  number: number;
  position: string;
  order: number;
}

export interface TagType {
  id: string;
  projectId: string;
  name: string;
  shortcut: string; // klávesová skratka, napr. "a", "1", "F2"
  category: TagCategory;
  color: string; // hex farba
  isDefault: boolean;
  order: number;
}

export interface TagEvent {
  id: string;
  projectId: string;
  tagTypeId: string;
  team: Team;
  playerId?: string;
  timestamp: number; // sekundy vo videu
  half: Half;
  note?: string;
  createdAt: number;
}

// --- Kreslenie na zastavený záber ---

export type Point = { x: number; y: number }; // normalizované 0..1

export type ShapeKind =
  | "arrow"
  | "line"
  | "dashedLine"
  | "ellipse"
  | "polyline"
  | "zone"
  | "text"
  | "spotlight"
  | "offsideLine"
  | "measure"
  | "movePlayer";

export interface BaseShape {
  id: string;
  kind: ShapeKind;
  color: string;
  strokeWidth: number; // v jednotkách normalizovaného priestoru * referenčná šírka
  /** Kreslí sa „na trávu“ v perspektíve ihriska (potrebuje kalibráciu kresby). */
  ground?: boolean;
}

export interface ArrowShape extends BaseShape {
  kind: "arrow";
  points: [Point, Point];
}

export interface LineShape extends BaseShape {
  kind: "line" | "dashedLine";
  points: [Point, Point];
}

export interface EllipseShape extends BaseShape {
  kind: "ellipse"; // kruh/elipsa pod hráčom
  center: Point;
  radiusX: number;
  radiusY: number;
  radiusM?: number; // pri ground: polomer na tráve v metroch
}

export interface PolylineShape extends BaseShape {
  kind: "polyline"; // spojnica medzi hráčmi (napr. línia obrany)
  points: Point[];
  showDistances?: boolean; // pri nastavenom ihrisku: vzdialenosti medzi susednými hráčmi v metroch
}

export interface ZoneShape extends BaseShape {
  kind: "zone"; // polygón so zvýraznenou výplňou
  points: Point[];
  fillOpacity: number;
}

export interface MovePlayerShape extends BaseShape {
  kind: "movePlayer"; // hráč odkiaľ → kam mal ísť (krúžok, dráha, „duch“ hráča na cieľovom mieste)
  points: [Point, Point];
}

export interface TextShape extends BaseShape {
  kind: "text";
  position: Point;
  text: string;
  fontSize: number; // relatívne k výške videa
}

export interface SpotlightShape extends BaseShape {
  kind: "spotlight"; // svetelný kužeľ zhora na hráča, štítok pod ním
  center: Point; // miesto dopadu svetla pri nohách
  radiusX: number;
  radiusY: number;
  radiusM?: number; // pri ground: polomer svetla na tráve v metroch
  label?: string; // napr. "#14 Pelikán"
}

export interface OffsideLineShape extends BaseShape {
  kind: "offsideLine"; // čiara cez celú šírku ihriska rovnobežne s bránkovou čiarou
  points: [Point];
}

export interface MeasureShape extends BaseShape {
  kind: "measure"; // vzdialenosť dvoch bodov na tráve v metroch
  points: [Point, Point];
}

export type Shape =
  | ArrowShape
  | LineShape
  | EllipseShape
  | PolylineShape
  | ZoneShape
  | TextShape
  | SpotlightShape
  | OffsideLineShape
  | MeasureShape
  | MovePlayerShape;

export type DrawTool = ShapeKind | "move";

// "freeze" = video sa na čase zastaví a kresba sa ukáže na durationSec.
// "track" = kresba sa pohybuje s hráčmi počas prehrávania (interpolácia medzi kľúčovými bodmi).
export type DrawingMode = "freeze" | "track";

export interface Keyframe {
  time: number; // sekundy vo videu
  shapes: Shape[]; // rovnaké id tvaru naprieč kľúčovými bodmi = ten istý tvar
}

/** Perspektíva ihriska: 4 rohy známeho obdĺžnika na tráve (v poradí 1–4) a jeho rozmery. */
export interface PitchCalibration {
  corners: [Point, Point, Point, Point]; // 1,2 = rohy na bránkovej čiare; 3,4 = protiľahlé rohy
  widthM: number; // vzdialenosť 1→2 (pozdĺž bránkovej čiary)
  depthM: number; // vzdialenosť 2→3 (do ihriska)
  presetId?: string;
  auto?: boolean; // odhad z uhla kamery (bez klikania bodov) — metre sú len približné, preto sa neukazujú
}

export interface Drawing {
  id: string;
  projectId: string;
  timestamp: number; // freeze: čas zastavenia; track: čas prvého kľúčového bodu
  durationSec: number; // freeze: dĺžka zastavenia; track: ako dlho kresba zostane po poslednom kľúčovom bode
  shapes: Shape[]; // track: tvary prvého kľúčového bodu
  mode?: DrawingMode; // chýba = "freeze" (kresby zo staršej verzie)
  keyframes?: Keyframe[]; // len pre "track", zoradené podľa času
  calibration?: PitchCalibration; // perspektíva ihriska pre tvary „na tráve“
  createdAt: number;
  updatedAt: number;
}

// --- Klipy a playlisty ---

export interface Clip {
  id: string;
  projectId: string;
  name: string;
  inPoint: number; // sekundy
  outPoint: number; // sekundy
  sourceTagEventId?: string;
  playerIds?: string[]; // hráči, ktorých sa klip týka (filter, playlist hráča, titulok v exporte)
  createdAt: number;
}

export interface Playlist {
  id: string;
  projectId: string;
  name: string;
  clipIds: string[]; // poradie určuje poradie prehrávania/exportu
  createdAt: number;
  updatedAt: number;
}

// --- Export projektu (JSON) ---

export interface ProjectExport {
  version: 1;
  project: Project;
  players: Player[];
  tagTypes: TagType[];
  tagEvents: TagEvent[];
  drawings: Drawing[];
  clips: Clip[];
  playlists: Playlist[];
}

export const HALF_SPLIT_DEFAULT_MINUTE = 45;
