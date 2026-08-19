import { useMemo, useRef, useState } from "react";
import { budgetState } from "../budget";
import { fmtDur, fmtTok, shortModel } from "../format";
import { dailyCost, dayStatFor, grandTotal, projectTotals } from "../history";
import { fill, useT } from "../i18n";
import { buildInsights } from "../insights";
import { cacheStats, fmtCost, PRICING_AS_OF } from "../pricing";
import { saveMarkdown } from "../media";
import { buildReport } from "../report";
import { roleKeyFor } from "../scene/roles";
import { useSettings } from "../settings";
import { buildStory, storyMarkdown } from "../story";
import { type AgentView, useOffice } from "../store";
import { send } from "../transport";

// ── Analitika dashboard ──────────────────────────────────────
// Chart kutubxonasi yo'q — SVG qo'lда. Dizayn `dataviz` qo'llanmasi bo'yicha:
//  • Forma vazifaga qarab: jami → STAT TILE (grafik emas); vaqt → AREA (1 qator,
//    legend kerak emas); rol → GORIZONTAL BAR (pie EMAS); tafsilot → JADVAL.
//  • Palitra TASDIQLANGAN (validator: dark, sirt #101419 → ALL CHECKS PASS).
//    CVD ogohlantirishi (green↔yellow ΔE 10.3) → har barда TO'G'RIDAN-TO'G'RI
//    YORLIQ + 2px oraliq, ya'ni shaxsiyat hech qachon faqat rangda emas.
//  • Matn HAR DOIM ink ranglarida (qator rangida emas). Grid/o'q — susaygan.
//  • Bitta o'q — hech qachon ikki y-shkala.

// Ink (dark sirt uchun)
const INK = "#ffffff";
const INK2 = "#c3c2b7";
const MUTED = "#898781";
const GRID = "#2c2c2a";
const BASE = "#383835";
// Sequential (bitta qator — xarajat)
const SERIES = "#3987e5";
// Kategorik — QAT'IY tartib (rol kaliti bo'yicha), hech qachon aylantirilmaydi
const ROLE_ORDER = ["research", "frontend", "backend", "qa", "docs", "data"] as const;
const CAT: Record<string, string> = {
  research: "#3987e5", // 1 blue
  frontend: "#199e70", // 2 aqua
  backend: "#c98500", // 3 yellow
  qa: "#008300", // 4 green
  docs: "#9085e9", // 5 violet
  data: "#e66767", // 6 red
};

function fmtClock(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Saralanadigan ustunlar — jadval sarlavhalari bosilganda ishlatiladi.
type SortKey = "role" | "cost" | "tok" | "turns" | "tools" | "ms";
const SORT_COLS: { key: SortKey; labelKey: string; left?: boolean }[] = [
  { key: "role", labelKey: "dash.colRole", left: true },
  { key: "cost", labelKey: "dash.colCost" },
  { key: "tok", labelKey: "dash.colTokens" },
  { key: "turns", labelKey: "dash.colTurns" },
  { key: "tools", labelKey: "dash.colTools" },
  { key: "ms", labelKey: "dash.colActive" },
];

// ── Stat tile — sarlavha raqami. Grafik EMAS (dataviz: ba'zan javob chart emas). ──
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: INK, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Xarajat — vaqt bo'yicha. Bitta qator → legend YO'Q (sarlavha uni nomlaydi).
//    Budjet — uzuq mos-yozuvlar chizig'i (qator emas → legend baribir kerak emas). ──
function CostChart({ samples, budget }: { samples: { t: number; cost: number }[]; budget: number }) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const W = 520, H = 132, PL = 44, PR = 10, PT = 10, PB = 20;
  const iw = W - PL - PR, ih = H - PT - PB;

  const { pts, maxY, path, area, budgetY } = useMemo(() => {
    const n = samples.length;
    if (n === 0) return { pts: [] as { x: number; y: number }[], maxY: 0, path: "", area: "", budgetY: null as number | null };
    const dataMax = Math.max(...samples.map((s) => s.cost), 0.0001);
    // Budjet chizig'i domenga qo'shiladi — LEKIN faqat ma'lumotdan 2×dan baland
    // bo'lmasa. Aks holda egri pastda yassilanib o'qilmay qoladi (mos-yozuvlar
    // chizig'i uchun qatorning aniqligini qurbon qilmaymiz).
    const inDomain = budget > 0 && budget <= dataMax * 2;
    const max = inDomain ? Math.max(dataMax, budget) : dataMax;
    // "Chiroyli" tepa — grid yaxlit sonlarда tursin
    const mag = Math.pow(10, Math.floor(Math.log10(max)));
    const maxY = Math.ceil(max / mag) * mag;
    const px = (i: number) => PL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const py = (v: number) => PT + ih - (v / maxY) * ih;
    const pts = samples.map((s, i) => ({ x: px(i), y: py(s.cost) }));
    const path = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = `${path} L${pts[pts.length - 1].x.toFixed(1)},${PT + ih} L${pts[0].x.toFixed(1)},${PT + ih} Z`;
    return { pts, maxY, path, area, budgetY: inDomain ? py(budget) : null };
  }, [samples, budget, iw, ih, PL, PT]);

  if (samples.length < 2) {
    return (
      <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, color: MUTED, border: `1px dashed ${GRID}`, borderRadius: 10 }}>
        {t("dash.collecting")}
      </div>
    );
  }

  const ticks = [0, 0.5, 1].map((f) => ({ v: maxY * f, y: PT + ih - f * ih }));
  const h = hover != null ? samples[hover] : null;
  const hp = hover != null ? pts[hover] : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * W;
        const i = Math.round(((x - PL) / iw) * (samples.length - 1));
        setHover(Math.max(0, Math.min(samples.length - 1, i)));
      }}
    >
      {/* Susaygan grid + $ belgilari */}
      {ticks.map((tk, i) => (
        <g key={i}>
          <line x1={PL} x2={W - PR} y1={tk.y} y2={tk.y} stroke={i === 0 ? BASE : GRID} strokeWidth={1} />
          <text x={PL - 6} y={tk.y + 3.5} textAnchor="end" fontSize={9.5} fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>{fmtCost(tk.v)}</text>
        </g>
      ))}
      {/* Maydon + chiziq (2px) — bitta qator, sequential ko'k */}
      <path d={area} fill={SERIES} opacity={0.16} />
      <path d={path} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {/* Budjet — uzuq mos-yozuvlar chizig'i, to'g'ridan-to'g'ri yorliq bilan */}
      {budgetY != null && (() => {
        const bc = budgetState(samples[samples.length - 1].cost, budget).color;
        return (
          <g pointerEvents="none">
            <line x1={PL} x2={W - PR} y1={budgetY} y2={budgetY} stroke={bc} strokeWidth={1} strokeDasharray="4 3" />
            <text x={W - PR} y={budgetY - 4} textAnchor="end" fontSize={9.5} fontWeight={600} fill={bc}>
              {t("budget.title")} {fmtCost(budget)}
            </text>
          </g>
        );
      })()}
      {/* Vaqt belgilari — faqat chekkalar (har nuqtaga raqam qo'ymaymiz) */}
      <text x={PL} y={H - 6} fontSize={9.5} fill={MUTED}>{fmtClock(samples[0].t)}</text>
      <text x={W - PR} y={H - 6} textAnchor="end" fontSize={9.5} fill={MUTED}>{fmtClock(samples[samples.length - 1].t)}</text>
      {/* Hover: krestcha + tooltip */}
      {h && hp && (
        <g pointerEvents="none">
          <line x1={hp.x} x2={hp.x} y1={PT} y2={PT + ih} stroke={INK2} strokeWidth={1} opacity={0.35} />
          <circle cx={hp.x} cy={hp.y} r={4} fill={SERIES} stroke="#101419" strokeWidth={2} />
          <g transform={`translate(${Math.min(Math.max(hp.x, PL + 34), W - PR - 34)}, ${Math.max(hp.y - 12, PT + 12)})`}>
            <rect x={-34} y={-15} width={68} height={19} rx={5} fill="#101419" stroke="rgba(255,255,255,0.14)" />
            <text x={0} y={-2} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={INK} style={{ fontVariantNumeric: "tabular-nums" }}>{fmtCost(h.cost)}</text>
          </g>
        </g>
      )}
    </svg>
  );
}

// ── Rol bo'yicha xarajat — gorizontal bar. Pie EMAS. Har barда to'g'ridan-to'g'ri
//    yorliq (rol + $) → shaxsiyat faqat rangda emas (CVD floor-band talabi). ──
function RoleBars({ rows, colors }: { rows: { key: string; label: string; cost: number }[]; colors?: Record<string, string> }) {
  const pal = colors ?? CAT;
  const max = Math.max(...rows.map((r) => r.cost), 0.0001);
  const BAR = 18, GAP = 8; // 2px spacer talabidan kengroq — yorliq sig'sin
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GAP }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 86, fontSize: 11, color: INK2, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</div>
          <div style={{ flex: 1, height: BAR, position: "relative", background: "rgba(255,255,255,0.04)", borderRadius: 4 }}>
            {/* 4px yumaloq ma'lumot-uchi, asosga bog'langan */}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(2, (r.cost / max) * 100)}%`, background: pal[r.key] ?? SERIES, borderRadius: 4 }} />
          </div>
          <div style={{ width: 62, fontSize: 11, fontWeight: 600, color: INK, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCost(r.cost)}</div>
        </div>
      ))}
    </div>
  );
}

// ── Budjet — sarflangan ulush. Rang SEMANTIK (yashil/sariq/qizil), kategorik
//    emas: u faqat holatni bildiradi va hech qanday grafikda qayta ishlatilmaydi.
//    Bar YONIDA doim raqam turadi → ma'no faqat rangда emas (CVD). ──
function BudgetBar({ spent, limit }: { spent: number; limit: number }) {
  const t = useT();
  const b = budgetState(spent, limit);
  const pct = Math.round(b.frac * 100);
  const msg = b.level === "over" ? t("budget.overMsg") : b.level === "warn" ? t("budget.warnMsg") : `${fmtCost(b.left)} ${t("budget.left")}`;
  return (
    <div style={{ marginBottom: 16, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: `1px solid ${b.level === "ok" ? "rgba(255,255,255,0.08)" : `${b.color}70`}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: INK2 }}>💸 {t("budget.title")}</span>
        <span style={{ fontSize: 11.5, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
          <b style={{ color: b.color, fontSize: 12.5 }}>{fmtCost(spent)}</b> / {fmtCost(limit)} · {pct}% {t("budget.used")}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 5, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, Math.max(1.5, b.frac * 100))}%`, height: "100%", background: b.color, borderRadius: 5, transition: "width 300ms ease" }} />
      </div>
      <div style={{ fontSize: 10.5, color: b.level === "ok" ? MUTED : b.color, marginTop: 5 }}>{msg}</div>
    </div>
  );
}

export default function Dashboard({ onClose }: { onClose: () => void }) {
  const t = useT();
  const agents = useOffice((s) => s.agents);
  const order = useOffice((s) => s.order);
  const samples = useOffice((s) => s.samples);
  const history = useOffice((s) => s.history);
  const archive = useOffice((s) => s.archive);
  const select = useOffice((s) => s.select);
  const onPickAgent = (id: number) => { select(id); send({ type: "focusAgent", id }); };
  const budgetUsd = useSettings((s) => s.budgetUsd);
  const [report, setReport] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showStory, setShowStory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Jadval saralash — ustun sarlavhasini bosib. Standart: xarajat kamayish tartibi.
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Hisobot BOSILGANDA yaratiladi (jonli emas) — nusxalanayotgan matn foydalanuvchi
  // ko'rib turgan matn bilan aynan bir xil bo'lsin.
  const openReport = () => {
    setCopied(false);
    setReport(buildReport({ agents: order.map((id) => agents[id]).filter(Boolean), now: Date.now(), budgetUsd, t }));
  };
  const copyReport = async () => {
    if (report == null) return;
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      // Clipboard API bloklangan bo'lsa (webview siyosati) — eski usul.
      taRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const { totalCost, totalTok, activeN, roleRows, agentRows, cache, modelRows } = useMemo(() => {
    let totalCost = 0, totalTok = 0, activeN = 0;
    // Kesh: har agentning O'Z modeli bo'yicha hisoblanadi (narxlar farq qiladi),
    // keyin jamlanadi — umumiy o'rtacha narx bilan taxmin qilmaymiz.
    let cacheRead = 0, allInput = 0, naive = 0, actual = 0;
    const byRole = new Map<string, number>();
    const byModel = new Map<string, number>();
    const agentRows: { id: number; roleKey: string; cost: number; tok: number; turns: number; tools: number; ms: number }[] = [];
    const now = Date.now();
    for (const id of order) {
      const a = agents[id];
      if (!a) continue;
      const tok = a.inputTokens + a.outputTokens;
      const ms = a.activeMs + (a.activeSince != null ? now - a.activeSince : 0);
      const rk = roleKeyFor(a.role, a.seatIndex);
      totalCost += a.costUsd;
      totalTok += tok;
      if (a.active) activeN++;
      byRole.set(rk, (byRole.get(rk) ?? 0) + a.costUsd);
      const cs = cacheStats(a.model, a.billed);
      naive += cs.naive;
      actual += cs.actual;
      cacheRead += a.billed.cacheRead;
      allInput += a.billed.input + a.billed.cacheWrite + a.billed.cacheRead;
      if (a.costUsd > 0) {
        const m = a.model ? shortModel(a.model) : "—";
        byModel.set(m, (byModel.get(m) ?? 0) + a.costUsd);
      }
      agentRows.push({ id, roleKey: rk, cost: a.costUsd, tok, turns: a.turns, tools: a.toolCalls, ms });
    }
    const cache = { hit: allInput > 0 ? cacheRead / allInput : 0, naive, actual, saved: naive - actual, any: allInput > 0 };
    const modelRows = [...byModel.entries()]
      .map(([key, cost]) => ({ key, label: key, cost }))
      .sort((a, b) => b.cost - a.cost);
    // RANG rolga (shaxsga) qat'iy bog'langan — reytingga EMAS: CAT[key] hech
    // qachon o'zgarmaydi. QATORLAR esa kattalik bo'yicha saralanadi — bu
    // magnitude-chart uchun o'qishni osonlashtiradi va jadval bilan mos keladi.
    const roleRows = ROLE_ORDER.filter((k) => byRole.has(k))
      .map((k) => ({ key: k as string, label: "", cost: byRole.get(k)! }))
      .sort((a, b) => b.cost - a.cost);
    agentRows.sort((a, b) => b.cost - a.cost);
    return { totalCost, totalTok, activeN, roleRows, agentRows, cache, modelRows };
  }, [agents, order]);

  // Tanlangan ustun bo'yicha saralangan qatorlar (rol — matn, qolgani — son).
  const sortedRows = useMemo(() => {
    const arr = [...agentRows];
    arr.sort((a, b) => {
      const va = sortKey === "role" ? a.roleKey : (a[sortKey] as number);
      const vb = sortKey === "role" ? b.roleKey : (b[sortKey] as number);
      const d = typeof va === "number" ? va - (vb as number) : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? d : -d;
    });
    return arr;
  }, [agentRows, sortKey, sortDir]);
  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  // Model ranglari — TARTIB bo'yicha (eng qimmatdan), tasdiqlangan kategorik palitradan.
  const MODEL_PAL = [CAT.research, CAT.frontend, CAT.backend, CAT.qa, CAT.docs, CAT.data];
  const modelColors: Record<string, string> = {};
  modelRows.forEach((r, i) => { modelColors[r.key] = MODEL_PAL[i % MODEL_PAL.length]; });

  const roleRowsLabeled = roleRows.map((r) => ({ ...r, label: t(`role.${r.key}` as never) }));
  const empty = order.length === 0;

  return (
    <div
      role="dialog"
      style={{
        position: "absolute", top: 52, right: 14, width: 560, maxHeight: "82vh", pointerEvents: "auto",
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: "rgba(16,20,27,0.97)", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14, boxShadow: "0 12px 34px rgba(0,0,0,0.55)", fontFamily: "system-ui",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>{t("dash.title")}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!empty && (
            <>
              <button
                onClick={() => setShowStory(true)}
                title={t("story.open")}
                aria-label={t("story.open")}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: INK2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)" }}
              >
                📖 {t("story.btn")}
              </button>
              <button
                onClick={openReport}
                title={t("rep.open")}
                aria-label={t("rep.open")}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: INK2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)" }}
              >
                📄 {t("rep.btn")}
              </button>
            </>
          )}
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(true)}
              title={t("hist.open")}
              aria-label={t("hist.open")}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: INK2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)" }}
            >
              🕰️ {t("hist.btn")}
            </button>
          )}
          <button onClick={onClose} aria-label={t("common.close")} style={{ border: "none", background: "transparent", color: MUTED, cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button>
        </div>
      </div>

      <div style={{ overflowY: "auto", padding: 14 }}>
        {empty ? (
          <div style={{ padding: "28px 12px", textAlign: "center", fontSize: 12.5, color: MUTED }}>{t("dash.noData")}</div>
        ) : (
          <>
            {/* 💡 Xulosalar — deterministik zukkolik (to'qnashuv, sikl, e'tibor) */}
            <InsightsSection agents={order.map((id) => agents[id]).filter(Boolean)} samples={samples} onPick={onPickAgent} />

            {/* KPI qatori — stat tile'lar (grafik emas) */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <Stat label={t("dash.totalCost")} value={`~${fmtCost(totalCost)}`} sub={`${t("dash.estimate")} (${PRICING_AS_OF})`} />
              <Stat label={t("dash.totalTokens")} value={fmtTok(totalTok)} />
              <Stat label={t("dash.activeAgents")} value={`${activeN} / ${order.length}`} />
            </div>

            {/* Budjet (sozlamalarda belgilangan bo'lsa) */}
            {budgetUsd > 0 && <BudgetBar spent={totalCost} limit={budgetUsd} />}

            {/* Xarajat — vaqt bo'yicha */}
            <div style={{ fontSize: 11.5, fontWeight: 600, color: INK2, marginBottom: 7 }}>{t("dash.costOverTime")}</div>
            <div style={{ marginBottom: 18 }}><CostChart samples={samples} budget={budgetUsd} /></div>

            {/* Rol bo'yicha */}
            {roleRowsLabeled.length > 0 && (
              <>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: INK2, marginBottom: 9 }}>{t("dash.byRole")}</div>
                <div style={{ marginBottom: 18 }}><RoleBars rows={roleRowsLabeled} /></div>
              </>
            )}

            {/* Kesh samaradorligi — ma'lumot billing tokenlaridan (kesh o'qish
                kirish narxining 10%i, yozish 125%i). Tejam MANFIY ham bo'lishi
                mumkin (kesh yozilgan-u, o'qilmagan) — yashirmaymiz. */}
            {cache.any && (
              <>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: INK2, marginBottom: 7 }}>{t("dash.cache")}</div>
                <div style={{ marginBottom: 18, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <span style={{ fontSize: 11.5, color: INK2 }}>♻️ {t("dash.cacheHit")}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: INK, fontVariantNumeric: "tabular-nums" }}>{Math.round(cache.hit * 100)}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 5, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(1, cache.hit * 100)}%`, height: "100%", background: SERIES, borderRadius: 5 }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <Stat
                      label={t("dash.cacheSaved")}
                      value={cache.saved >= 0 ? `~${fmtCost(cache.saved)}` : `−${fmtCost(-cache.saved)}`}
                      sub={cache.saved < 0 ? t("dash.cacheNegative") : undefined}
                    />
                    <Stat label={t("dash.cacheNaive")} value={`~${fmtCost(cache.naive)}`} sub={`${t("dash.cacheActual")} ~${fmtCost(cache.actual)}`} />
                  </div>
                </div>
              </>
            )}

            {/* Model bo'yicha xarajat */}
            {modelRows.length > 0 && (
              <>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: INK2, marginBottom: 9 }}>{t("dash.byModel")}</div>
                <div style={{ marginBottom: 18 }}><RoleBars rows={modelRows} colors={modelColors} /></div>
              </>
            )}

            {/* Agent jadvali */}
            <div style={{ fontSize: 11.5, fontWeight: 600, color: INK2, marginBottom: 7 }}>{t("dash.agentsTable")}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr style={{ color: MUTED, textAlign: "right" }}>
                  {SORT_COLS.map((c) => {
                    const activeCol = sortKey === c.key;
                    return (
                      <th
                        key={c.key}
                        onClick={() => onSort(c.key)}
                        title={t("dash.sortBy")}
                        style={{ textAlign: c.left ? "left" : "right", fontWeight: 500, padding: "4px 6px", cursor: "pointer", color: activeCol ? INK : MUTED, userSelect: "none", whiteSpace: "nowrap" }}
                      >
                        {t(c.labelKey as never)}{activeCol ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${GRID}`, color: INK2, textAlign: "right" }}>
                    <td style={{ textAlign: "left", padding: "5px 6px", color: INK }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: CAT[r.roleKey] ?? SERIES, marginRight: 6 }} />
                      {t(`role.${r.roleKey}` as never)}
                    </td>
                    <td style={{ padding: "5px 6px", color: INK, fontWeight: 600 }}>{fmtCost(r.cost)}</td>
                    <td style={{ padding: "5px 6px" }}>{fmtTok(r.tok)}</td>
                    <td style={{ padding: "5px 6px" }}>{r.turns}</td>
                    <td style={{ padding: "5px 6px" }}>{r.tools}</td>
                    <td style={{ padding: "5px 6px" }}>{fmtDur(r.ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* ── Sessiya hisoboti (markdown) — panel ustidan qoplama ── */}
      {report !== null && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: 14, gap: 8, background: "#0d1117" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>{t("rep.panel")}</span>
            <button onClick={() => setReport(null)} aria-label={t("common.close")} style={{ border: "none", background: "transparent", color: MUTED, cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button>
          </div>
          <textarea
            ref={taRef}
            value={report}
            readOnly
            spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
            style={{ flex: 1, minHeight: 220, resize: "none", boxSizing: "border-box", fontFamily: "ui-monospace, monospace", fontSize: 10.5, lineHeight: 1.5, borderRadius: 8, padding: 10, background: "rgba(0,0,0,0.4)", color: INK2, border: `1px solid ${GRID}`, whiteSpace: "pre", overflow: "auto" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1, fontSize: 10.5, color: MUTED }}>{t("rep.hint")}</span>
            <button
              onClick={() => saveMarkdown("report", report)}
              title={t("rep.saveTip")}
              style={{
                padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)",
              }}
            >
              💾 {t("rep.save")}
            </button>
            <button
              onClick={copyReport}
              style={{
                padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#fff",
                border: `1px solid ${copied ? "rgba(48,209,88,0.6)" : "rgba(94,155,255,0.6)"}`,
                background: copied ? "rgba(48,209,88,0.22)" : "rgba(94,155,255,0.22)",
              }}
            >
              {copied ? t("rep.copied") : `📋 ${t("rep.copy")}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Sessiya hikoyasi — o'qiladigan hikoya (kartalar) ── */}
      {showStory && <StoryPanel agents={order.map((id) => agents[id]).filter(Boolean)} onClose={() => setShowStory(false)} />}

      {/* ── Tarix — kunlik trend, kecha vs bugun, loyiha jamlanma, arxiv ── */}
      {showHistory && <HistoryPanel days={history} archive={archive} onClose={() => setShowHistory(false)} />}
    </div>
  );
}

// ── Tarix paneli — extension VAQT bo'yicha ko'radi. host `~/.agent-office/
//    history.json`да yiqqan kunlik/loyiha jamlanmasini ko'rsatadi (o'lchangan). ──
function localDayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function DeltaBadge({ now, prev }: { now: number; prev: number }) {
  const t = useT();
  if (prev <= 0) return null;
  const pct = Math.round(((now - prev) / prev) * 100);
  const up = pct > 0;
  const col = up ? "#ff9f0a" : pct < 0 ? "#30d158" : MUTED;
  return <span style={{ fontSize: 10.5, color: col, fontWeight: 700 }}>{up ? "▲" : pct < 0 ? "▼" : "="} {Math.abs(pct)}% {t("hist.vsYesterday")}</span>;
}
function fmtHistDate(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function HistoryPanel({ days, archive, onClose }: { days: import("../history").HistoryDay[]; archive: import("../history").ArchiveSession[]; onClose: () => void }) {
  const t = useT();
  const daily = useMemo(() => dailyCost(days).slice(-14), [days]); // so'nggi ~2 hafta
  const projects = useMemo(() => projectTotals(days).slice(0, 6), [days]);
  const total = useMemo(() => grandTotal(days), [days]);
  const today = dayStatFor(days, localDayISO(0));
  const yday = dayStatFor(days, localDayISO(1));
  const maxDay = Math.max(...daily.map((d) => d.cost), 0.0001);
  const maxProj = Math.max(...projects.map((p) => p.stat.cost), 0.0001);
  const todayISO = localDayISO(0);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: 14, gap: 12, background: "#0d1117", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>🕰️ {t("hist.title")}</span>
        <button onClick={onClose} aria-label={t("common.close")} style={{ border: "none", background: "transparent", color: MUTED, cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: -6 }}>{t("hist.hint")}</div>

      {/* Kecha vs bugun */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 4 }}>{t("hist.today")}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: INK, lineHeight: 1.1 }}>~{fmtCost(today.cost)}</div>
          <div style={{ marginTop: 3 }}><DeltaBadge now={today.cost} prev={yday.cost} /></div>
        </div>
        <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 4 }}>{t("hist.yesterday")}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: INK2, lineHeight: 1.1 }}>~{fmtCost(yday.cost)}</div>
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 3 }}>{yday.tools} {t("dash.colTools").toLowerCase()}</div>
        </div>
      </div>

      {/* Kunlik trend — bar chart (so'nggi 14 kun) */}
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: INK2, marginBottom: 8 }}>{t("hist.trend")}</div>
        {daily.length === 0 ? (
          <div style={{ fontSize: 11.5, color: MUTED }}>{t("dash.noData")}</div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 110, padding: "0 2px" }}>
            {daily.map((d) => {
              const h = Math.max(2, (d.cost / maxDay) * 96);
              const isToday = d.date === todayISO;
              return (
                <div key={d.date} title={`${d.date}: ~${fmtCost(d.cost)}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 0 }}>
                  <div style={{ width: "100%", maxWidth: 22, height: h, borderRadius: 3, background: isToday ? "#3987e5" : "#2c6aa8" }} />
                  <span style={{ fontSize: 8.5, color: MUTED, whiteSpace: "nowrap" }}>{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Loyiha bo'yicha jami — gorizontal barlar */}
      {projects.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: INK2, marginBottom: 8 }}>{t("hist.byProject")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {projects.map((p, i) => (
              <div key={p.project} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 96, fontSize: 11, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.project}</span>
                <div style={{ flex: 1, height: 14, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(3, (p.stat.cost / maxProj) * 100)}%`, height: "100%", background: MODEL_PAL_H[i % MODEL_PAL_H.length], borderRadius: 4 }} />
                </div>
                <span style={{ width: 52, textAlign: "right", fontSize: 11, color: INK2, fontVariantNumeric: "tabular-nums" }}>~{fmtCost(p.stat.cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Umumiy jami */}
      <div style={{ display: "flex", gap: 8, borderTop: `1px solid ${GRID}`, paddingTop: 10 }}>
        <TotalTile label={t("hist.totalCost")} value={`~${fmtCost(total.cost)}`} />
        <TotalTile label={t("hist.totalTokens")} value={fmtTok(total.inTok + total.outTok)} />
        <TotalTile label={t("hist.totalTime")} value={fmtDur(total.ms)} />
      </div>

      {/* So'nggi sessiyalar arxivi — eng yangi birinchi */}
      {archive.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: INK2, marginBottom: 8 }}>{t("hist.recent")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {archive.slice(0, 20).map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name || s.project}{s.name ? <span style={{ opacity: 0.6, fontWeight: 400 }}> · 📁 {s.project}</span> : null}
                  </span>
                  <span style={{ display: "block", fontSize: 10, color: MUTED }}>{fmtHistDate(s.at)} · {s.tools} {t("dash.colTools").toLowerCase()} · {fmtDur(s.ms)}</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#30d158", fontVariantNumeric: "tabular-nums" }}>~{fmtCost(s.cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
const MODEL_PAL_H = [CAT.research, CAT.frontend, CAT.backend, CAT.qa, CAT.docs, CAT.data];
function TotalTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div style={{ fontSize: 9.5, color: MUTED, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: INK, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// ── Xulosalar bo'limi — extension BARCHA sessiyalarni ko'radi, shuning uchun
//    bitta Claude bilmaydigan narsalarni aytadi (to'qnashuv, sikl…). AI EMAS. ──
const INSIGHT_COLOR: Record<string, string> = { warn: "#ff9f0a", info: "#3987e5", good: "#30d158" };
function InsightsSection({ agents, samples, onPick }: { agents: AgentView[]; samples: { t: number; cost: number }[]; onPick: (id: number) => void }) {
  const t = useT();
  const insights = useMemo(() => buildInsights(agents, samples as never, Date.now()), [agents, samples]);
  if (insights.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: INK2, marginBottom: 7 }}>{t("insight.title")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {insights.map((ins) => {
          const col = INSIGHT_COLOR[ins.level];
          const vars = ins.vars && ins.vars.rate != null ? { ...ins.vars, rate: fmtCost(ins.vars.rate as number) } : ins.vars;
          const clickable = !!ins.agentIds?.length;
          return (
            <div
              key={ins.id}
              onClick={clickable ? () => onPick(ins.agentIds![0]) : undefined}
              style={{
                display: "flex", alignItems: "flex-start", gap: 7, padding: "7px 9px", borderRadius: 8,
                background: `${col}14`, border: `1px solid ${col}44`, cursor: clickable ? "pointer" : "default",
              }}
            >
              <span style={{ fontSize: 12.5, lineHeight: 1.35, flexShrink: 0 }}>{ins.icon}</span>
              <span style={{ fontSize: 11.5, lineHeight: 1.4, color: INK2, wordBreak: "break-word" }}>{fill(t(ins.key as never), vars)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sessiya hikoyasi paneli — har agent nima qilgani (o'lchangan ma'lumotdan) ──
function StoryPanel({ agents, onClose }: { agents: AgentView[]; onClose: () => void }) {
  const t = useT();
  const stories = useMemo(() => buildStory(agents, Date.now()), [agents]);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: 14, gap: 6, background: "#0d1117" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>{t("story.title")}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => saveMarkdown("story", storyMarkdown(stories, t))}
            title={t("rep.saveTip")}
            disabled={stories.length === 0}
            style={{ padding: "5px 11px", borderRadius: 7, cursor: stories.length === 0 ? "default" : "pointer", fontSize: 11.5, fontWeight: 600, color: "#fff", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", opacity: stories.length === 0 ? 0.4 : 1 }}
          >
            💾 {t("rep.save")}
          </button>
          <button onClick={onClose} aria-label={t("common.close")} style={{ border: "none", background: "transparent", color: MUTED, cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button>
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 2 }}>{t("story.hint")}</div>
      <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {stories.map((s) => {
          const col = CAT[s.roleKey] ?? SERIES;
          const mostly = s.cats.slice(0, 2).map((c) => t(`story.cat.${c.cat}` as never)).join(" · ");
          return (
            <div key={s.id} style={{ padding: "9px 11px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: col, flexShrink: 0 }} />
                <b style={{ fontSize: 12.5, color: INK }}>{s.name}</b>
                <span style={{ fontSize: 11, color: MUTED }}>{t(`role.${s.roleKey}` as never)}{s.model ? ` · ${shortModel(s.model)}` : ""}</span>
              </div>
              {/* Boshlang'ich vazifa (birinchi prompt) — agent NIMA qilishga kelgani */}
              {s.task && <div style={{ fontSize: 11, color: MUTED, marginTop: 3, lineHeight: 1.4 }}>📋 {s.task}</div>}
              {/* Bir jumlada: qancha ishladi, nechta tool, nechta navbat */}
              <div style={{ fontSize: 11.5, color: INK2, marginTop: 4 }}>
                {s.tools > 0
                  ? <>⏱ {fmtDur(s.ms)} {t("story.worked")} · {s.tools} {t("story.toolsN")} · {s.turns} {t("story.turnsN")}</>
                  : <span style={{ opacity: 0.7 }}>{t("story.quietOne")}</span>}
              </div>
              {/* Asosan nima bilan shug'ullandi */}
              {mostly && <div style={{ fontSize: 11.5, color: INK2, marginTop: 2 }}>🧰 {t("story.mostly")} {mostly}</div>}
              {s.subagents > 0 && <div style={{ fontSize: 11, color: "#ffd60a", marginTop: 2 }}>🌳 {s.subagents} {t("story.subHired")}</div>}
              {s.blockedReason && <div style={{ fontSize: 11, color: "#ff8a80", marginTop: 2, fontFamily: "ui-monospace, monospace", wordBreak: "break-word" }}>⛔ {t("story.blockedNow")}: {s.blockedReason}</div>}
              {s.cost > 0 && (
                <div style={{ fontSize: 11, color: MUTED, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                  💰 ~{fmtCost(s.cost)} · {fmtTok(s.tokens)} {t("insp.output")}{s.cacheSavedPct > 0 ? ` · ♻️ ${s.cacheSavedPct}% ${t("story.cacheSaved")}` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
