import { NODES } from "./nav";

// ── Agent "hozirligi" reyestri (ijtimoiy hayot uchun) ────────
// Agentlar bir-birini ko'rishi (yaqinlashib uchrashishi) uchun modul-darajali
// registr. ZUSTAND EMAS — har freym yoziladi/o'qiladi, re-render bo'lmasligi
// kerak. Faqat DEKORATIV hayot: uchrashuv = emoji imo-ishora (👋/☕), hech
// qanday soxta ma'lumot yo'q.

export interface Presence { id: number; x: number; z: number; idle: boolean }
const reg = new Map<number, Presence>();

/** Har agent o'z joyi + bo'sh (idle) holatini bildiradi (throttled). */
export function report(id: number, x: number, z: number, idle: boolean): void {
  const p = reg.get(id);
  if (p) { p.x = x; p.z = z; p.idle = idle; }
  else reg.set(id, { id, x, z, idle });
}
export function unreport(id: number): void {
  reg.delete(id);
  clearMeeting(id);
}

// ── Uchrashuvlar ─────────────────────────────────────────────
// Uchrashuv = umumiy "gather" nav-tuguni + tugash vaqti. Ikki agent shu
// tugunga boradi, yonma-yon turib imo-ishora qiladi, so'ng tarqaydi.
export interface Meet { point: string; until: number }
const meets = new Map<number, Meet>();

export function meetingOf(id: number): Meet | null {
  return meets.get(id) ?? null;
}
export function clearMeeting(id: number): void {
  meets.delete(id);
}

// Ijtimoiy uchrashuv joylari (xona ichki tugunlari) — bir juft agent shu yerда
// uchrashadi. Katta ofisda tasodifiy yaqinlashish deyarli bo'lmaydi, shuning
// uchun umumiy "hub"ga chaqiramiz (oshxona/lounge/dam olish) — bu tabiiy
// ko'rinadi ("tanaffusга chiqishdi").
const SOCIAL_HUBS = ["kitchen_i", "lounge_i", "meeting_i", "library_i", "focus_i"];

/** Bo'sh, juftlashmagan sherik izlaydi (YAQINLIK shart emas — hub'ga boradilar).
 *  Faqat KICHIK id tashabbus qiladi (ikkovi bir vaqtda yaratmasin). */
export function seekMeeting(id: number, x: number, z: number, now: number): Meet | null {
  const mine = meets.get(id);
  if (mine) return mine;
  const me = reg.get(id);
  if (!me || !me.idle) return null;
  let partner: Presence | null = null;
  for (const p of reg.values()) {
    if (p.id === id || !p.idle || meets.has(p.id)) continue;
    // Eng kichik id'li bo'sh sherik (deterministik juftlik)
    if (!partner || p.id < partner.id) partner = p;
  }
  if (!partner || id > partner.id) return null;
  // Juftlik markaziga ENG YAQIN hub — uzoq yurmasin (uchrashuv tez bo'lsin).
  const mx = (x + partner.x) / 2, mz = (z + partner.z) / 2;
  let node = SOCIAL_HUBS[0], bd = Infinity;
  for (const h of SOCIAL_HUBS) {
    const n = NODES[h];
    const d = (n.x - mx) ** 2 + (n.z - mz) ** 2;
    if (d < bd) { bd = d; node = h; }
  }
  // `until` = XAVFSIZLIK timeout'i (hub'ga yurib borish + suhbat). Asosiy
  // tugash — yetib borgandan keyin (AgentAvatar: metAt + ~5.5s).
  const until = now + 26;
  meets.set(id, { point: node, until });
  meets.set(partner.id, { point: node, until });
  return meets.get(id)!;
}

/** Sinov/diagnostika uchun — reyestrni tozalaydi. */
export function _reset(): void {
  reg.clear();
  meets.clear();
}
