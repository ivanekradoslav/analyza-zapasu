export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}.${pad(ms)}`;
}

export function formatMinute(seconds: number, half: 1 | 2): string {
  // Minúta zápasu: v 2. polčase pokračuje od 45. (zjednodušené, bez nadstavenia).
  const totalMin = Math.floor(seconds / 60) + 1;
  if (half === 2) {
    return `${totalMin}.`;
  }
  return `${totalMin}.`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
