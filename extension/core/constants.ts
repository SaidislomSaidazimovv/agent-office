// ── Umumiy konstantalar (Pixel Agents'дан tasdiqlangan qiymatlar) ──
// Bu qiymatlar manba-koddan olingan; xatti-harakat pariteti uchun saqlanadi.

/** Claude Code terminal nomi prefiksi — VS Code terminallarини agentlarга
 *  moslashда ishlatiladi. */
export const CLAUDE_TERMINAL_NAME_PREFIX = "Claude Code";

/** JSONL faylини polling qilish davri (ms). fs.watch macOS/WSL2'да ishonchsiz —
 *  Pixel Agents ham faqat polling ishlatadi. */
export const FILE_WATCHER_POLL_INTERVAL_MS = 500;
/** Bir polling'да o'qiladigan maksimal bayt (yangi qatorlar uchun). */
export const MAX_READ_BYTES = 65536;

/** Yangi JSONL fayllar uchun loyiha skani davri (ms). */
export const PROJECT_SCAN_INTERVAL_MS = 1000;
/** `+Agent`'дан keyin JSONL fayl paydo bo'lishини kutish polling davri. */
export const JSONL_POLL_INTERVAL_MS = 1000;

/** Faqat-matnli navbat idle deb belgilanadigan sukunat (ms). */
export const TEXT_IDLE_DELAY_MS = 5000;
/** Tool tugagach "done" broadcast kechikishi (ms). */
export const TOOL_DONE_DELAY_MS = 300;
/** Heuristik ruxsat (permission) taymeri (ms) — hook kelmasa. */
export const PERMISSION_TIMER_DELAY_MS = 7000;

/** "Reading" animatsiyasini ko'rsatadigan toollar (aks holda "typing"). */
export const READING_TOOLS = new Set([
  "Read", "Grep", "Glob", "LS", "NotebookRead", "WebFetch", "WebSearch",
]);
/** Sub-agent personajini yaratadigan toollar. */
export const SUBAGENT_TOOL_NAMES = new Set(["Task", "Agent"]);
/** Ruxsat taymerini ishga tushirmaydigan toollar. */
export const PERMISSION_EXEMPT_TOOLS = new Set(["Task", "Agent", "AskUserQuestion"]);

/** Standart kontekst oynasi (token health-bar uchun, model aniqlanmasa). */
export const MAX_CONTEXT_TOKENS = 200000;
/** 1M-kontekst rejimidagi sessiyalar (masalan opus-4-8[1m]). */
export const CONTEXT_WINDOW_1M = 1000000;

/** Model ID'сидан kontekst oynasi hajmини aniqlaydi. Claude Code transcriptи
 *  `message.model` maydonида model nomini beradi (masalan "claude-opus-4-8[1m]",
 *  "claude-sonnet-5", "claude-haiku-4-5"). "1m" belgisи bo'lsa 1M, aks holda 200k. */
export function contextWindowForModel(model: string | undefined): number {
  if (!model) return MAX_CONTEXT_TOKENS;
  const m = model.toLowerCase();
  // [1m], -1m, "1m" — 1M-kontekst beta rejimi
  if (m.includes("1m")) return CONTEXT_WINDOW_1M;
  return MAX_CONTEXT_TOKENS;
}
