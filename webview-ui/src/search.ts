// ── Agent qidiruvi ───────────────────────────────────────────
// Sof funksiya: DOM'siz, store'siz → test qilinadi. Qidiruv agentning KO'RINIB
// TURGAN maydonlari bo'yicha: papka nomi, rol yorlig'i, holat va joriy tool.
// Reyting: papka nomi boshidan mos kelsa eng yuqori (odam odatda shuni yozadi).

export interface Searchable {
  id: number;
  folderName: string;
  /** Qo'shimcha nom (masalan nom berilgan agentning repo papkasi) — u bo'yicha ham topiladi. */
  folderAlt?: string;
  roleLabel: string;
  statusLabel: string;
  toolLabel?: string;
}

const norm = (s: string) => s.toLowerCase().trim();

/** Bitta agent uchun ball (0 = mos emas). Katta ball = yuqoriroq. */
export function scoreAgent(a: Searchable, q: string): number {
  const n = norm(q);
  if (!n) return 1; // bo'sh so'rov — hammasi (tartib o'zgarmaydi)
  const folder = norm(a.folderName);
  const role = norm(a.roleLabel);
  const status = norm(a.statusLabel);
  const tool = norm(a.toolLabel ?? "");
  const alt = norm(a.folderAlt ?? "");
  if (folder.startsWith(n)) return 100;
  if (alt && alt.startsWith(n)) return 70;
  if (alt && alt.includes(n)) return 40;
  if (role.startsWith(n)) return 80;
  if (folder.includes(n)) return 60;
  if (role.includes(n)) return 50;
  if (tool.includes(n)) return 30;
  if (status.includes(n)) return 20;
  return 0;
}

/** Mos kelganlarni ball bo'yicha (teng bo'lsa — asl tartibda) qaytaradi. */
export function matchAgents<T extends Searchable>(list: T[], q: string): T[] {
  return list
    .map((a, i) => ({ a, i, s: scoreAgent(a, q) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .map((x) => x.a);
}
