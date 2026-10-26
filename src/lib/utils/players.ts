import type { Player } from "@/types";

/** Krátky popis hráča: "#9 Pelikán" (bez označenia kapitána). */
export function playerLabel(p: Player) {
  const surname = p.name.replace(/\s*\(C\)\s*$/, "").split(/\s+/).pop();
  return `#${p.number} ${surname}`;
}
