import { budgetState } from "./budget";
import { fmtDur, fmtTok, shortModel } from "./format";
import type { Key } from "./i18n";
import { fmtCost, PRICING_AS_OF } from "./pricing";
import { roleKeyFor } from "./scene/roles";
import type { AgentView } from "./store";

// ── Sessiya hisoboti (markdown) ──────────────────────────────
// Sof funksiya: DOM'ga, store'ga va i18n store'iga BOG'LIQ EMAS — `t` parametr
// sifatida uzatiladi. Shu sababli test qilinadi va til almashsa ham to'g'ri.
// Ma'lumot O'LCHANGAN holatdan olinadi — hech narsa to'qib chiqarilmaydi.

/** Markdown jadval katagi uchun xavfsiz matn (| va yangi qator jadvalni buzmasin). */
function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ").trim();
}

/** "2026-07-12 14:32" (mahalliy vaqt). */
function stamp(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface ReportInput {
  /** Agentlar — ko'rsatish tartibida. */
  agents: AgentView[];
  /** Hisobot yaratilgan payt (ms) — tashqaridan beriladi (test uchun barqaror). */
  now: number;
  /** Xarajat budjeti ($). 0 = o'chiq → hisobotда ko'rsatilmaydi. */
  budgetUsd: number;
  /** Tarjimon (reaktiv `useT()` yoki test uchun `(k) => k`). */
  t: (k: Key) => string;
}

/** Sessiya holatini markdown hisobotga aylantiradi (nusxalash uchun). */
export function buildReport(o: ReportInput): string {
  const { agents, now, budgetUsd, t } = o;
  const L = (k: string) => t(k as Key);

  let cost = 0, inTok = 0, outTok = 0, tools = 0, turns = 0, ms = 0, active = 0;
  const byRole = new Map<string, number>();
  for (const a of agents) {
    cost += a.costUsd;
    inTok += a.inputTokens;
    outTok += a.outputTokens;
    tools += a.toolCalls;
    turns += a.turns;
    ms += a.activeMs + (a.activeSince != null ? now - a.activeSince : 0);
    if (a.active) active++;
    const rk = roleKeyFor(a.role, a.seatIndex);
    byRole.set(rk, (byRole.get(rk) ?? 0) + a.costUsd);
  }

  const out: string[] = [];
  out.push(`# 🏢 ${L("rep.h1")}`);
  out.push("");
  out.push(`*${L("rep.generated")}: ${stamp(now)}*`);
  out.push("");

  if (agents.length === 0) {
    out.push(L("dash.noData"));
    out.push("");
    return out.join("\n");
  }

  // ── Xulosa ──
  out.push(`## ${L("rep.summary")}`);
  out.push("");
  out.push(`| ${cell(L("rep.metric"))} | ${cell(L("rep.value"))} |`);
  out.push("| --- | --- |");
  const rows: [string, string][] = [
    [L("dash.activeAgents"), `${active} / ${agents.length}`],
    [L("dash.totalCost"), `~${fmtCost(cost)}`],
    [L("dash.totalTokens"), `${fmtTok(inTok + outTok)} (↓ ${fmtTok(inTok)} · ↑ ${fmtTok(outTok)})`],
    [L("dash.colTools"), `${tools}`],
    [L("dash.colTurns"), `${turns}`],
    [L("rep.activeTime"), fmtDur(ms)],
  ];
  if (budgetUsd > 0) {
    const b = budgetState(cost, budgetUsd);
    rows.push([L("budget.title"), `${fmtCost(cost)} / ${fmtCost(budgetUsd)} · ${Math.round(b.frac * 100)}%`]);
  }
  for (const [k, v] of rows) out.push(`| ${cell(k)} | ${cell(v)} |`);
  out.push("");

  // ── Agentlar ──
  out.push(`## ${L("rep.agents")}`);
  out.push("");
  const head = [L("rep.agent"), L("dash.colRole"), L("rep.model"), L("rep.status"), L("dash.colCost"), L("dash.colTokens"), L("dash.colTools"), L("dash.colTurns"), L("dash.colActive")];
  out.push(`| ${head.map(cell).join(" | ")} |`);
  out.push(`| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |`);
  // Xarajat bo'yicha kamayish tartibida — jadval dashboard bilan bir xil o'qiladi.
  for (const a of [...agents].sort((x, y) => y.costUsd - x.costUsd)) {
    const at = a.activeMs + (a.activeSince != null ? now - a.activeSince : 0);
    out.push(`| ${[
      cell(a.folderName),
      cell(L(`role.${roleKeyFor(a.role, a.seatIndex)}`)),
      a.model ? cell(shortModel(a.model)) : "—",
      cell(L(`status.${a.status}`)),
      fmtCost(a.costUsd),
      `${fmtTok(a.inputTokens)} / ${fmtTok(a.outputTokens)}`,
      `${a.toolCalls}`,
      `${a.turns}`,
      fmtDur(at),
    ].join(" | ")} |`);
  }
  out.push("");

  // ── Rol bo'yicha ──
  if (cost > 0 && byRole.size > 0) {
    out.push(`## ${L("dash.byRole")}`);
    out.push("");
    out.push(`| ${cell(L("dash.colRole"))} | ${cell(L("dash.colCost"))} | ${cell(L("rep.share"))} |`);
    out.push("| --- | ---: | ---: |");
    for (const [rk, c] of [...byRole.entries()].sort((a, b) => b[1] - a[1])) {
      out.push(`| ${cell(L(`role.${rk}`))} | ${fmtCost(c)} | ${Math.round((c / cost) * 100)}% |`);
    }
    out.push("");
  }

  out.push("---");
  out.push(`*${L("rep.footer")} (${PRICING_AS_OF})*`);
  out.push("");
  return out.join("\n");
}
