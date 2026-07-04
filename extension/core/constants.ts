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
/** Heuristik ruxsat taymeri — INSTANT (Edit/Write) toollar uchun (ms). Bu
 *  toollar millisekundда tugaydi, shu sababли uzoq "sukunat" = ruxsat kutish. */
export const PERMISSION_TIMER_FAST_MS = 5000;
/** Heuristik ruxsat taymeri — UZOQ ishlashи mumkin bo'lган toollar (Bash,
 *  MCP, noma'lum) uchun (ms). build/test qonuniy uzoq davom etadi, shu sababли
 *  false-positive bo'lmasин uchun ancha kutamiz. */
export const PERMISSION_TIMER_SLOW_MS = 40000;

/** "Reading" animatsiyasini ko'rsatadigan toollar (aks holda "typing"). */
export const READING_TOOLS = new Set([
  "Read", "Grep", "Glob", "LS", "NotebookRead", "WebFetch", "WebSearch",
]);
/** Sub-agent personajini yaratadigan toollar. */
export const SUBAGENT_TOOL_NAMES = new Set(["Task", "Agent"]);
/** Millisekundда tugaydigan o'zgartiruvchi toollar — bular hang bo'lса
 *  deyarli aniq ruxsat kutilyapti (tez taymer). Bash bunда YO'Q (uzoq bo'lishi
 *  mumkin → sekin taymer). */
export const INSTANT_WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
/** Ruxsat taymerini ishga tushirmaydigan toollar — default rejimда ular
 *  avtomatik ruxsat etiladi (read-only + boshqaruv toollarи). Faqat
 *  Edit/Write/Bash kabi o'zgartiruvchi toollар ruxsat so'raydi. */
export const PERMISSION_EXEMPT_TOOLS = new Set([
  "Task", "Agent", "AskUserQuestion", "TodoWrite",
  "Read", "Grep", "Glob", "LS", "NotebookRead", "WebFetch", "WebSearch",
]);

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
