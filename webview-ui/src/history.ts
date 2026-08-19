// ── Tarix — kunlik/loyiha bo'yicha jamlanma (sof funksiyalar) ──
// Extension host `~/.agent-office/history.json`ga yozadi va ochilganда jo'natadi.
// Bu modul faqat KO'RSATISH uchun jamlaydi — hech narsa to'qib chiqarilmaydi,
// hammasi o'lchangan (host yig'gan) ma'lumotdan. DOM'siz → test qilinadi.

export interface DayStat {
  /** Taxminiy xarajat ($). */
  cost: number;
  inTok: number;
  outTok: number;
  tools: number;
  /** Faol vaqt (ms). */
  ms: number;
}

/** Bir kun — loyiha (repo) nomi → o'sha kungi jamlanma. */
export interface HistoryDay {
  /** YYYY-MM-DD (mahalliy sana). */
  date: string;
  projects: Record<string, DayStat>;
}

/** Arxivdagi bitta sessiya (o'tган ish) — so'nggi sessiyalar ro'yxati uchun. */
export interface ArchiveSession {
  /** Qo'lda berilgan nom (bo'lsa). */
  name?: string;
  /** Loyiha (repo) papkasi. */
  project: string;
  /** Birinchi ko'rilган payt (ms) — saralash + sana uchun. */
  at: number;
  cost: number;
  inTok: number;
  outTok: number;
  tools: number;
  ms: number;
}

export function emptyStat(): DayStat {
  return { cost: 0, inTok: 0, outTok: 0, tools: 0, ms: 0 };
}
export function addStat(a: DayStat, b: DayStat): DayStat {
  return { cost: a.cost + b.cost, inTok: a.inTok + b.inTok, outTok: a.outTok + b.outTok, tools: a.tools + b.tools, ms: a.ms + b.ms };
}

/** Bir kunning barcha loyihalari bo'yicha jami. */
export function dayTotal(d: HistoryDay): DayStat {
  return Object.values(d.projects).reduce(addStat, emptyStat());
}

/** Kunlik xarajat — sana o'sish tartibida (trend grafigi uchun). */
export function dailyCost(days: HistoryDay[]): { date: string; cost: number }[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ date: d.date, cost: dayTotal(d).cost }));
}

/** Loyiha (repo) bo'yicha jami — barcha kunlar, kamayish tartibida. */
export function projectTotals(days: HistoryDay[]): { project: string; stat: DayStat }[] {
  const m = new Map<string, DayStat>();
  for (const d of days) {
    for (const [p, s] of Object.entries(d.projects)) m.set(p, addStat(m.get(p) ?? emptyStat(), s));
  }
  return [...m.entries()].map(([project, stat]) => ({ project, stat })).sort((a, b) => b.stat.cost - a.stat.cost);
}

/** Berilgan sanadagi jami (topilmasa — nol). "Kecha vs bugun" uchun. */
export function dayStatFor(days: HistoryDay[], date: string): DayStat {
  const d = days.find((x) => x.date === date);
  return d ? dayTotal(d) : emptyStat();
}

/** Barcha kunlar bo'yicha umumiy jami. */
export function grandTotal(days: HistoryDay[]): DayStat {
  return days.map(dayTotal).reduce(addStat, emptyStat());
}
