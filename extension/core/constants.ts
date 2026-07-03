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

/** Bitta agent kontekst oynasi (token health-bar uchun). */
export const MAX_CONTEXT_TOKENS = 200000;
