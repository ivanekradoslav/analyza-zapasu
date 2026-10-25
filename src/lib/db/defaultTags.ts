import type { TagType } from "@/types";

type DefaultTagSeed = Pick<TagType, "name" | "shortcut" | "category" | "color">;

// Predvolené tagy podľa zadania. Skratky sú na numerickej aj písmenovej
// časti klávesnice, aby sa nekryli a dali sa ovládať jednou rukou.
export const DEFAULT_TAGS: DefaultTagSeed[] = [
  // Herné fázy
  { name: "Útok", shortcut: "q", category: "phase", color: "#22c55e" },
  { name: "Obrana", shortcut: "w", category: "phase", color: "#ef4444" },
  { name: "Prechod do útoku", shortcut: "e", category: "phase", color: "#84cc16" },
  { name: "Prechod do obrany", shortcut: "r", category: "phase", color: "#f97316" },
  { name: "Štandardná situácia", shortcut: "t", category: "phase", color: "#a855f7" },

  // Udalosti
  { name: "Strela", shortcut: "a", category: "event", color: "#3b82f6" },
  { name: "Gól", shortcut: "s", category: "event", color: "#eab308" },
  { name: "Strata lopty", shortcut: "d", category: "event", color: "#dc2626" },
  { name: "Zisk lopty", shortcut: "f", category: "event", color: "#16a34a" },
  { name: "Prihrávka do finálnej tretiny", shortcut: "g", category: "event", color: "#0ea5e9" },
  { name: "Centr", shortcut: "h", category: "event", color: "#06b6d4" },

  // Pressing / obrana
  { name: "Vysoký presing", shortcut: "z", category: "press", color: "#f43f5e" },
  { name: "Presing po strate", shortcut: "x", category: "press", color: "#fb7185" },
  { name: "Blok", shortcut: "c", category: "press", color: "#64748b" },
  { name: "Zlá kompaktnosť", shortcut: "v", category: "press", color: "#b91c1c" },
];

export const CATEGORY_LABELS: Record<string, string> = {
  phase: "Herné fázy",
  event: "Udalosti",
  press: "Pressing/obrana",
  custom: "Vlastné",
};
