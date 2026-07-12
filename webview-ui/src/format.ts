// ── Umumiy formatlash yordamchilari ──────────────────────────
// HUD, dashboard va markdown hisoboti bir xil ko'rsatsin — bitta manba.

/** Tokenlar: 940 → "940", 12 400 → "12k", 1 240 000 → "1.2M". */
export function fmtTok(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Davomiylik (ixcham): 42s · 7m · 1h 4m. Inspektor soniyani ham ko'rsatadi (o'z formati). */
export function fmtDur(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Model id → qisqa nom ("claude-opus-4-8[1m]" → "Opus 4.8"). */
export function shortModel(m: string): string {
  const s = m.toLowerCase();
  const fam = s.includes("fable") ? "Fable" : s.includes("mythos") ? "Mythos" : s.includes("haiku") ? "Haiku" : s.includes("sonnet") ? "Sonnet" : s.includes("opus") ? "Opus" : "";
  const ver = m.match(/(\d+)-(\d+)/);
  return fam ? `${fam}${ver ? " " + ver[1] + "." + ver[2] : ""}` : m.slice(0, 14);
}
