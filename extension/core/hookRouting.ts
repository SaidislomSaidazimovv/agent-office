// ── Ko'p-oyna hook yo'naltirish (sof funksiyalar) ────────────
// Har VS Code oynasi (yoki CLI) O'Z hook-serverini ishga tushiradi va
// ~/.agent-office/servers/<pid>.json ga {port, token, pid, folders} yozadi.
// Claude hook-skripti event'ning `cwd`'siga qarab ENG MOS oynani (eng uzun mos
// ish-papka) tanlaydi. Shu tariqa 2+ oyna ochiq bo'lganda ham har agent o'z
// oynasida ishonchli (hook) aniqlanadi — biror oyna JSONL zaxirasida qolmaydi.
// DOM/tarmoqsiz → test qilinadi.

export interface ServerEntry {
  port: number;
  token: string;
  pid: number;
  /** Shu oyna kuzatayotgan ish-papkalar (mutlaq yo'llar). */
  folders: string[];
}

/** Yo'lni taqqoslash uchun normallashtiradi — oxirgi ajratgichlar olib
 *  tashlanadi, Windows'da katta-kichik harf farqsiz. */
export function normPath(p: string): string {
  const s = p.replace(/[\\/]+$/, "");
  return process.platform === "win32" ? s.toLowerCase() : s;
}

/** `cwd` `folder` ichidami (yoki aynan o'zi)? Ikkala ajratgich ham qo'llanadi. */
export function within(cwd: string, folder: string): boolean {
  const c = normPath(cwd);
  const f = normPath(folder);
  return c === f || c.startsWith(f + "/") || c.startsWith(f + "\\");
}

/** `cwd` uchun eng mos serverni tanlaydi — folders ichida ENG UZUN mos papka
 *  (eng aniq). Hech biri mos kelmasa null (chaqiruvchi zaxira tanlaydi). */
export function pickServerForCwd(servers: ServerEntry[], cwd: string): ServerEntry | null {
  let best: ServerEntry | null = null;
  let bestLen = -1;
  for (const s of servers) {
    for (const f of s.folders || []) {
      const len = normPath(f).length;
      if (within(cwd, f) && len > bestLen) {
        best = s;
        bestLen = len;
      }
    }
  }
  return best;
}
