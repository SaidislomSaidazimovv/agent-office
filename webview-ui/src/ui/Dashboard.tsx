import { useMemo, useRef, useState } from "react";
import { budgetState } from "../budget";
import { fmtDur, fmtTok } from "../format";
import { useT } from "../i18n";
import { fmtCost, PRICING_AS_OF } from "../pricing";
import { buildReport } from "../report";
import { roleKeyFor } from "../scene/roles";
import { useSettings } from "../settings";
import { useOffice } from "../store";

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
function RoleBars({ rows }: { rows: { key: string; label: string; cost: number }[] }) {
  const max = Math.max(...rows.map((r) => r.cost), 0.0001);
  const BAR = 18, GAP = 8; // 2px spacer talabidan kengroq — yorliq sig'sin
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GAP }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 86, fontSize: 11, color: INK2, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</div>
          <div style={{ flex: 1, height: BAR, position: "relative", background: "rgba(255,255,255,0.04)", borderRadius: 4 }}>
            {/* 4px yumaloq ma'lumot-uchi, asosga bog'langan */}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(2, (r.cost / max) * 100)}%`, background: CAT[r.key] ?? SERIES, borderRadius: 4 }} />
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
  const budgetUsd = useSettings((s) => s.budgetUsd);
  const [report, setReport] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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

  const { totalCost, totalTok, activeN, roleRows, agentRows } = useMemo(() => {
    let totalCost = 0, totalTok = 0, activeN = 0;
    const byRole = new Map<string, number>();
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
      agentRows.push({ id, roleKey: rk, cost: a.costUsd, tok, turns: a.turns, tools: a.toolCalls, ms });
    }
    // RANG rolga (shaxsga) qat'iy bog'langan — reytingga EMAS: CAT[key] hech
    // qachon o'zgarmaydi. QATORLAR esa kattalik bo'yicha saralanadi — bu
    // magnitude-chart uchun o'qishni osonlashtiradi va jadval bilan mos keladi.
    const roleRows = ROLE_ORDER.filter((k) => byRole.has(k))
      .map((k) => ({ key: k as string, label: "", cost: byRole.get(k)! }))
      .sort((a, b) => b.cost - a.cost);
    agentRows.sort((a, b) => b.cost - a.cost);
    return { totalCost, totalTok, activeN, roleRows, agentRows };
  }, [agents, order]);

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
            <button
              onClick={openReport}
              title={t("rep.open")}
              aria-label={t("rep.open")}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: INK2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)" }}
            >
              📄 {t("rep.btn")}
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

            {/* Agent jadvali */}
            <div style={{ fontSize: 11.5, fontWeight: 600, color: INK2, marginBottom: 7 }}>{t("dash.agentsTable")}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr style={{ color: MUTED, textAlign: "right" }}>
                  <th style={{ textAlign: "left", fontWeight: 500, padding: "4px 6px" }}>{t("dash.colRole")}</th>
                  <th style={{ fontWeight: 500, padding: "4px 6px" }}>{t("dash.colCost")}</th>
                  <th style={{ fontWeight: 500, padding: "4px 6px" }}>{t("dash.colTokens")}</th>
                  <th style={{ fontWeight: 500, padding: "4px 6px" }}>{t("dash.colTurns")}</th>
                  <th style={{ fontWeight: 500, padding: "4px 6px" }}>{t("dash.colTools")}</th>
                  <th style={{ fontWeight: 500, padding: "4px 6px" }}>{t("dash.colActive")}</th>
                </tr>
              </thead>
              <tbody>
                {agentRows.map((r) => (
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
    </div>
  );
}
