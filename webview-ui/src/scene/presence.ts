import { NODES } from "./nav";

// ── Agent "hozirligi" reyestri (ijtimoiy hayot uchun) ────────
// Agentlar bir-birini ko'rishi (yaqinlashib uchrashishi) uchun modul-darajali
// registr. ZUSTAND EMAS — har freym yoziladi/o'qiladi, re-render bo'lmasligi
// kerak. Faqat DEKORATIV hayot: uchrashuv = emoji imo-ishora (👋/💬/☕).

export interface Presence { id: number; x: number; z: number; idle: boolean; metAt: number }
const reg = new Map<number, Presence>();

/** Har agent o'z joyi + bo'sh holati + uchrashuvга yetgan payti (metAt) bildiradi. */
export function report(id: number, x: number, z: number, idle: boolean, metAt = 0): void {
  const p = reg.get(id);
  if (p) { p.x = x; p.z = z; p.idle = idle; p.metAt = metAt; }
  else reg.set(id, { id, x, z, idle, metAt });
}
export function presenceOf(id: number): Presence | undefined {
  return reg.get(id);
}
export function unreport(id: number): void {
  reg.delete(id);
  clearMeeting(id);
}

/** Agent-agent collision: (x,z) boshqa (id emas) agentга rad ichida yaqinmi? */
export function blockedByAgent(id: number, x: number, z: number, rad: number): boolean {
  const r2 = rad * rad;
  for (const p of reg.values()) {
    if (p.id === id) continue;
    const dx = p.x - x, dz = p.z - z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}

// ── Uchrashuvlar ─────────────────────────────────────────────
// Uchrashuv = umumiy "gather" nav-tuguni + har agentга ALOHIDA joy (side: chap/
// o'ng) → yopishmaydi, orasida masofa bo'ladi. Emote FAQAT ikkovi ham yetganда.
export interface Meet { partner: number; point: string; side: number; until: number }
const meets = new Map<number, Meet>();

export function meetingOf(id: number): Meet | null {
  return meets.get(id) ?? null;
}
export function clearMeeting(id: number): void {
  meets.delete(id);
}

// Ijtimoiy uchrashuv joylari (xona ichki tugunlari). Katta ofisda tasodifiy
// yaqinlashish bo'lmagani uchun umumiy hub'ga chaqiramiz ("tanaffusга chiqishdi").
const SOCIAL_HUBS = ["kitchen_i", "lounge_i", "meeting_i", "library_i", "focus_i"];

/** Bo'sh, juftlashmagan sherik izlaydi. Faqat KICHIK id tashabbus qiladi.
 *  Ikkoviga umumiy hub + qarama-qarshi tomon (side ±1) beriladi. */
export function seekMeeting(id: number, x: number, z: number, now: number): Meet | null {
  const mine = meets.get(id);
  if (mine) return mine;
  const me = reg.get(id);
  if (!me || !me.idle) return null;
  let partner: Presence | null = null;
  for (const p of reg.values()) {
    if (p.id === id || !p.idle || meets.has(p.id)) continue;
    if (!partner || p.id < partner.id) partner = p;
  }
  if (!partner || id > partner.id) return null;
  const mx = (x + partner.x) / 2, mz = (z + partner.z) / 2;
  let node = SOCIAL_HUBS[0], bd = Infinity;
  for (const h of SOCIAL_HUBS) {
    const n = NODES[h];
    const d = (n.x - mx) ** 2 + (n.z - mz) ** 2;
    if (d < bd) { bd = d; node = h; }
  }
  const until = now + 30; // xavfsizlik timeout'i (yurib borish + suhbat)
  meets.set(id, { partner: partner.id, point: node, side: -1, until });
  meets.set(partner.id, { partner: id, point: node, side: 1, until });
  return meets.get(id)!;
}

// Uchrashuvдаги turish joyi — hub markazidan `side` bo'yicha x-siljish
// (ikkovi ~1.1m masofada yonma-yon; bir-biriga qaraydi).
export const MEET_OFFSET = 0.55;
export function meetSpot(m: Meet): { x: number; z: number } {
  const n = NODES[m.point];
  return { x: n.x + m.side * MEET_OFFSET, z: n.z };
}

/** Sinov/diagnostika uchun — reyestrni tozalaydi. */
export function _reset(): void {
  reg.clear();
  meets.clear();
}
