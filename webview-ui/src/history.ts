// ── Tarix — kunlik/loyiha bo'yicha jamlanma (sof funksiyalar) ──
// Extension host `~/.agent-office/history.json`ga yozadi va ochilganда jo'natadi.
// Bu modul faqat KO'RSATISH uchun jamlaydi — hech narsa to'qib chiqarilmaydi,
// hammasi o'lchangan (host yig'gan) ma'lumotdan. DOM'siz → test qilinadi.

import { shortModel } from "./format";

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
  /** Sessiya modeli (xom id, masalan "claude-opus-4-8"). Eski yozuvlarда bo'lmasligi mumkin. */
  model?: string;
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

export type Granularity = "day" | "week" | "month";

/** Sana (YYYY-MM-DD) uchun haftaning DUSHANBAsi (YYYY-MM-DD). */
function weekStart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = (d.getDay() + 6) % 7; // Dushanba=0 … Yakshanba=6
  d.setDate(d.getDate() - dow);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function bucketKey(date: string, gran: Granularity): string {
  return gran === "month" ? date.slice(0, 7) : gran === "week" ? weekStart(date) : date;
}

/** Kunlik xarajatni kun/hafta/oy bo'yicha guruhlaydi (trend grafigi granularligi).
 *  `key` — sortlanadigan bucket kaliti; `label` — qisqa ko'rsatiladigan yorliq. */
export function rollupCost(days: HistoryDay[], gran: Granularity): { key: string; label: string; cost: number }[] {
  const buckets = new Map<string, number>();
  for (const d of days) {
    const key = bucketKey(d.date, gran);
    buckets.set(key, (buckets.get(key) ?? 0) + dayTotal(d).cost);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, cost]) => ({ key, label: gran === "month" ? key : key.slice(5), cost }));
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

/** CSV katak — vergul/qo'shtirnoq/yangi qatorни qochiradi (RFC 4180). */
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Kunlik tarixni CSV qilib beradi (sana o'sish tartibida). Har qator — bir
 *  kun × bir loyiha. Jadvalда (Excel/Sheets) pivot uchun tayyor. */
export function historyCsv(days: HistoryDay[]): string {
  const rows: string[] = ["date,project,cost_usd,input_tokens,output_tokens,tools,active_ms"];
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const [project, s] of Object.entries(d.projects)) {
      rows.push([d.date, csvCell(project), s.cost.toFixed(4), String(s.inTok), String(s.outTok), String(s.tools), String(s.ms)].join(","));
    }
  }
  return rows.join("\n");
}

/** Model bo'yicha jami — arxivlangan sessiyalardan, short-model bo'yicha
 *  guruhlangan (masalan "Opus 4.8"), xarajat kamayish tartibida. Modeli
 *  noma'lum sessiyalar hisobga olinmaydi (eski yozuvlar). */
export function modelTotals(sessions: ArchiveSession[]): { model: string; cost: number; tok: number; count: number }[] {
  const m = new Map<string, { cost: number; tok: number; count: number }>();
  for (const s of sessions) {
    if (!s.model) continue;
    const key = shortModel(s.model);
    const cur = m.get(key) ?? { cost: 0, tok: 0, count: 0 };
    cur.cost += s.cost;
    cur.tok += s.inTok + s.outTok;
    cur.count += 1;
    m.set(key, cur);
  }
  return [...m.entries()]
    .map(([model, v]) => ({ model, cost: v.cost, tok: v.tok, count: v.count }))
    .sort((a, b) => b.cost - a.cost);
}
