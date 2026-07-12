// ── E'tibor talab qiladigan agentlar ─────────────────────────
// Sof mantiq (vscode'siz) → test qilinadi. Ikki savolga javob beradi:
//   1) Status barда nima yozilsin (nechta agent, nechtasi sizni kutmoqda)?
//   2) Qaysi agent JUDA uzoq kutib qoldi (siz e'tibor bermay qo'ygansiz)?

/** Shuncha vaqt ruxsat kutilsa — "tiqilib qolgan" deb hisoblanadi. */
export const STUCK_MS = 3 * 60_000;

export interface AttentionAgent {
  id: number;
  permissionActive: boolean;
  blocked: boolean;
}

export interface Attention {
  total: number;
  /** Ruxsat kutayotganlar — SIZNING javobingiz kerak. */
  waiting: number;
  /** Xato tufayli to'xtaganlar. */
  blocked: number;
}

export function summarize(agents: AttentionAgent[]): Attention {
  let waiting = 0, blocked = 0;
  for (const a of agents) {
    if (a.permissionActive) waiting++;
    if (a.blocked) blocked++;
  }
  return { total: agents.length, waiting, blocked };
}

/** Status bar matni. Nishon (badge) faqat kerak bo'lganda qo'shiladi — tinch holatda toza. */
export function statusText(a: Attention): string {
  let s = `$(organization) ${a.total}`;
  if (a.waiting > 0) s += ` $(bell) ${a.waiting}`;
  if (a.blocked > 0) s += ` $(error) ${a.blocked}`;
  return s;
}

/** E'tibor kerakmi (status bar'ni sariq qilish uchun). */
export function needsAttention(a: Attention): boolean {
  return a.waiting > 0 || a.blocked > 0;
}

/** Foydalanuvchi bergan nom — xavfsiz va ixcham holga keltiradi.
 *  Bo'sh (yoki faqat bo'shliq) → "" ya'ni nom olib tashlandi, papka nomiga qaytadi. */
export const MAX_NAME_LEN = 32;
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return s.length > MAX_NAME_LEN ? s.slice(0, MAX_NAME_LEN) : s;
}

/** STUCK_MS dan uzoq kutayotgan, ammo hali "tiqilgan" deb belgilanmagan agentlar. */
export function newlyStuck(since: Map<number, number>, already: Set<number>, now: number): number[] {
  const out: number[] = [];
  for (const [id, t] of since) {
    if (already.has(id)) continue;
    if (now - t >= STUCK_MS) out.push(id);
  }
  return out;
}
