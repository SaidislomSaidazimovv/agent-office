import { budgetState } from "./budget";
import { fmtDur, fmtTok, shortModel } from "./format";
import type { Key } from "./i18n";
import { cacheStats, fmtCost, PRICING_AS_OF } from "./pricing";
import type { ReportInput } from "./report";
import { roleKeyFor } from "./scene/roles";
import { displayName } from "./store";

// ── Sessiya hisoboti (mustaqil HTML) ─────────────────────────
// `buildReport` bilan bir xil ma'lumot, lekin ulashsa/arxivlasa bo'ladigan
// O'ZI-YETARLI HTML fayl: barcha uslub inline, TASHQI RESURS YO'Q (offline,
// CSP-xavfsiz). Sof funksiya (DOM/store/i18n store'siz) — test qilinadi.

const ROLE_COLOR: Record<string, string> = {
  research: "#c9b0ff", frontend: "#8ec7ff", backend: "#7ee0c0", qa: "#ffd479", docs: "#ff9fb0", data: "#9ad0ff",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function stamp(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Sessiya holatini o'zi-yetarli HTML hisobotga aylantiradi (ulashish uchun). */
export function buildReportHtml(o: ReportInput): string {
  const { agents, now, budgetUsd, t } = o;
  const L = (k: string) => t(k as Key);

  let cost = 0, inTok = 0, outTok = 0, tools = 0, turns = 0, ms = 0, active = 0;
  let cacheRead = 0, allInput = 0, naive = 0;
  const byRole = new Map<string, number>();
  for (const a of agents) {
    const cs = cacheStats(a.model, a.billed);
    naive += cs.naive;
    cacheRead += a.billed.cacheRead;
    allInput += a.billed.input + a.billed.cacheWrite + a.billed.cacheRead;
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

  const card = (label: string, value: string, sub = ""): string =>
    `<div class="card"><div class="k">${esc(label)}</div><div class="v">${esc(value)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ""}</div>`;

  const cards: string[] = [
    card(L("dash.activeAgents"), `${active} / ${agents.length}`),
    card(L("dash.totalCost"), `~${fmtCost(cost)}`, `${L("dash.estimate")} (${PRICING_AS_OF})`),
    card(L("dash.totalTokens"), fmtTok(inTok + outTok), `↓ ${fmtTok(inTok)} · ↑ ${fmtTok(outTok)}`),
    card(L("dash.colTools"), `${tools}`),
    card(L("dash.colTurns"), `${turns}`),
    card(L("rep.activeTime"), fmtDur(ms)),
  ];
  if (allInput > 0) {
    const saved = naive - cost;
    cards.push(card(L("dash.cache"), `${Math.round((cacheRead / allInput) * 100)}%`, `${L("dash.cacheSaved")} ~${saved >= 0 ? fmtCost(saved) : `−${fmtCost(-saved)}`}`));
  }
  if (budgetUsd > 0) {
    const b = budgetState(cost, budgetUsd);
    cards.push(card(L("budget.title"), `${fmtCost(cost)} / ${fmtCost(budgetUsd)}`, `${Math.round(b.frac * 100)}%`));
  }

  const rows = [...agents].sort((x, y) => y.costUsd - x.costUsd).map((a) => {
    const at = a.activeMs + (a.activeSince != null ? now - a.activeSince : 0);
    const rk = roleKeyFor(a.role, a.seatIndex);
    return `<tr>
      <td>${esc(displayName(a))}</td>
      <td><span class="dot" style="background:${ROLE_COLOR[rk] || "#9aa3af"}"></span>${esc(L(`role.${rk}`))}</td>
      <td>${a.model ? esc(shortModel(a.model)) : "—"}</td>
      <td>${esc(L(`status.${a.status}`))}</td>
      <td class="n">~${fmtCost(a.costUsd)}</td>
      <td class="n">${fmtTok(a.inputTokens)} / ${fmtTok(a.outputTokens)}</td>
      <td class="n">${a.toolCalls}</td>
      <td class="n">${a.turns}</td>
      <td class="n">${fmtDur(at)}</td>
    </tr>`;
  }).join("");

  const maxRole = Math.max(...[...byRole.values()], 0.0001);
  const roleBars = [...byRole.entries()].sort((a, b) => b[1] - a[1]).map(([rk, c]) =>
    `<div class="bar"><span class="bl">${esc(L(`role.${rk}`))}</span><span class="bt"><span class="bf" style="width:${Math.max(3, (c / maxRole) * 100)}%;background:${ROLE_COLOR[rk] || "#9aa3af"}"></span></span><span class="bv">~${fmtCost(c)}</span></div>`,
  ).join("");

  const head = [L("rep.agent"), L("dash.colRole"), L("rep.model"), L("rep.status"), L("dash.colCost"), L("dash.colTokens"), L("dash.colTools"), L("dash.colTurns"), L("dash.colActive")];

  const body = agents.length === 0
    ? `<p class="empty">${esc(L("dash.noData"))}</p>`
    : `<div class="cards">${cards.join("")}</div>
       <h2>${esc(L("rep.agents"))}</h2>
       <table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
       ${cost > 0 && byRole.size > 0 ? `<h2>${esc(L("dash.byRole"))}</h2><div class="bars">${roleBars}</div>` : ""}`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(L("rep.h1"))} — ${stamp(now)}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;padding:28px 20px;background:#0d1117;color:#e8ecf2;font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;max-width:960px;margin-inline:auto}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:26px 0 10px;color:#aeb8c6}
.ts{color:#8a94a6;font-size:12px;margin-bottom:18px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
.card{background:#161b22;border:1px solid #232b36;border-radius:12px;padding:12px 14px}
.card .k{font-size:11px;color:#8a94a6}.card .v{font-size:20px;font-weight:700;margin-top:2px}.card .s{font-size:10.5px;color:#6b7688;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:4px}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #1d242e;white-space:nowrap}
th{color:#8a94a6;font-weight:600;font-size:11px}
td.n,th:nth-child(n+5){text-align:right;font-variant-numeric:tabular-nums}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
.bars{display:flex;flex-direction:column;gap:7px}
.bar{display:flex;align-items:center;gap:10px}
.bl{width:110px;font-size:12px}.bt{flex:1;height:14px;border-radius:5px;background:#1d242e;overflow:hidden}.bf{display:block;height:100%;border-radius:5px}.bv{width:64px;text-align:right;font-size:12px;color:#aeb8c6;font-variant-numeric:tabular-nums}
.empty{color:#8a94a6;text-align:center;padding:40px 0}
footer{margin-top:26px;padding-top:14px;border-top:1px solid #1d242e;color:#6b7688;font-size:11px}
</style></head>
<body>
<h1>🏢 ${esc(L("rep.h1"))}</h1>
<div class="ts">${esc(L("rep.generated"))}: ${stamp(now)}</div>
${body}
<footer>${esc(L("rep.footer"))} (${PRICING_AS_OF})</footer>
</body></html>`;
}
