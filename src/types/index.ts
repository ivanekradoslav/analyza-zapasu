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
  | "spotlight";

export interface BaseShape {
  id: string;
  kind: ShapeKind;
  color: string;
  strokeWidth: number; // v jednotkách normalizovaného priestoru * referenčná šírka
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
}

export interface PolylineShape extends BaseShape {
  kind: "polyline"; // spojnica medzi hráčmi (napr. línia obrany)
  points: Point[];
}

export interface ZoneShape extends BaseShape {
  kind: "zone"; // polygón so zvýraznenou výplňou
  points: Point[];
  fillOpacity: number;
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
  label?: string; // napr. "#14 Pelikán"
}

export type Shape =
  | ArrowShape
  | LineShape
  | EllipseShape
  | PolylineShape
  | ZoneShape
  | TextShape
  | SpotlightShape;

export type DrawTool = ShapeKind | "move";

// "freeze" = video sa na čase zastaví a kresba sa ukáže na durationSec.
// "track" = kresba sa pohybuje s hráčmi počas prehrávania (interpolácia medzi kľúčovými bodmi).
export type DrawingMode = "freeze" | "track";

export interface Keyframe {
  time: number; // sekundy vo videu
  shapes: Shape[]; // rovnaké id tvaru naprieč kľúčovými bodmi = ten istý tvar
}

export interface Drawing {
  id: string;
  projectId: string;
  timestamp: number; // freeze: čas zastavenia; track: čas prvého kľúčového bodu
  durationSec: number; // freeze: dĺžka zastavenia; track: ako dlho kresba zostane po poslednom kľúčovom bode
  shapes: Shape[]; // track: tvary prvého kľúčového bodu
  mode?: DrawingMode; // chýba = "freeze" (kresby zo staršej verzie)
  keyframes?: Keyframe[]; // len pre "track", zoradené podľa času
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
