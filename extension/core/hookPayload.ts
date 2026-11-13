// ── Hook payload'ini ixchamlashtirish (sof funksiya — test qilinadi) ──
// Claude Code hook stdin'iga KATTA va SHAXSIY ma'lumot beradi: PostToolUse'da
// butun tool natijasi (`tool_response` — o'qilgan fayl, buyruq chiqishi),
// UserPromptSubmit'da foydalanuvchi so'rovi, Stop'da javob matni, Write'da butun
// fayl mazmuni. Ofisga bularning hech biri kerak emas. Hook-skript lokal serverga
// FAQAT kerakli maydonlarni yuboradi:
//   • maxfiylik — keraksiz matn jarayonlar orasida yurmaydi;
//   • ishonchlilik — server 256KB+ tanani rad etardi va tool "osilib" qolardi.

/** Server/handler ishlatadigan yuqori darajadagi maydonlar (qolgani tashlanadi). */
const KEEP = new Set([
  "session_id", "transcript_path", "cwd", "permission_mode", "hook_event_name",
  "tool_name", "tool_input", "tool_use_id", "error", "is_interrupt",
  "message", "notification_type", "source", "reason", "agent_id", "agent_type",
]);

/** tool_input ichidagi bitta satr qiymatining maksimal uzunligi. Status
 *  yorlig'i/rol aniqlash faqat boshini ishlatadi (file_path, command, pattern…). */
export const MAX_INPUT_STR = 2000;
/** Xato / bildirishnoma matni uchun chegara (UI 180 belgigacha ko'rsatadi). */
export const MAX_TEXT = 2000;

function slimValue(v: unknown, depth: number): unknown {
  if (typeof v === "string") return v.length > MAX_INPUT_STR ? `${v.slice(0, MAX_INPUT_STR)}…[${v.length}]` : v;
  if (depth >= 4 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => slimValue(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = slimValue(x, depth + 1);
  return out;
}

/** Hook payload'idan faqat kerakli, cheklangan maydonlarni qoldiradi.
 *  Deterministik — bir xil input bir xil natija beradi (Pre/Post imzosi mos). */
export function slimHookPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!KEEP.has(k)) continue;
    if (k === "tool_input") out[k] = slimValue(v, 0);
    else if ((k === "error" || k === "message") && typeof v === "string") out[k] = v.length > MAX_TEXT ? v.slice(0, MAX_TEXT) : v;
    else out[k] = v;
  }
  return out;
}
