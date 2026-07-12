import { useRef } from "react";
import { fmtDur, fmtTok, shortModel } from "../format";
import { type Key, useT } from "../i18n";
import { fmtCost } from "../pricing";
import { roleKeyFor, STATUS_COLOR } from "../scene/roles";
import { useSettings } from "../settings";
import { displayName, useOffice } from "../store";
import { send } from "../transport";

// ── Matn rejimi (a11y) ───────────────────────────────────────
// 3D sahna ekran o'quvchi uchun yopiq eshik: WebGL tuvali mazmunsiz. Bu rejimda
// AYNAN o'sha ma'lumot oddiy, klaviatura bilan yuriladigan ro'yxat ko'rinishida
// beriladi — holat, joriy tool, tokenlar, xarajat, sub-agentlar va xato sababi.
// Rejim yoqilganda Canvas UMUMAN chizilmaydi (GPU ham bo'shaydi).

export default function TextOffice() {
  const t = useT();
  const agents = useOffice((s) => s.agents);
  const order = useOffice((s) => s.order);
  const selectedId = useOffice((s) => s.selectedId);
  const select = useOffice((s) => s.select);
  const showCost = useSettings((s) => s.showCost);
  const listRef = useRef<HTMLUListElement>(null);

  // ↑/↓ — qatorlar orasida fokusni ko'chirish (Tab ham ishlaydi).
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-row]");
    if (!items || items.length === 0) return;
    e.preventDefault();
    const cur = Array.from(items).findIndex((b) => b === document.activeElement);
    const next = e.key === "ArrowDown" ? Math.min(items.length - 1, cur + 1) : Math.max(0, cur - 1);
    items[next < 0 ? 0 : next].focus();
  };

  return (
    <div
      role="region"
      aria-label={t("text.title")}
      style={{
        position: "absolute", inset: 0, overflowY: "auto", padding: "58px 16px 56px",
        fontFamily: "system-ui", color: "#e8ecf2", background: "#0d1117",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>{t("text.title")}</h2>
        <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 14px" }}>{t("text.hint")}</p>

        {order.length === 0 ? (
          <p style={{ fontSize: 13, opacity: 0.7 }}>{t("empty.body")}</p>
        ) : (
          <ul ref={listRef} onKeyDown={onKey} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {order.map((id) => {
              const a = agents[id];
              if (!a) return null;
              const on = selectedId === id;
              const c = STATUS_COLOR[a.status];
              const status = t(`status.${a.status}` as Key);
              const role = t(`role.${roleKeyFor(a.role, a.seatIndex)}` as Key);
              const ms = a.activeMs + (a.activeSince != null ? Date.now() - a.activeSince : 0);
              return (
                <li key={id}>
                  <button
                    data-row
                    onClick={() => select(id)}
                    aria-current={on ? "true" : undefined}
                    // Ekran o'quvchi bitta jumlada hammasini o'qisin
                    aria-label={`${displayName(a)}, ${role}, ${status}${a.toolLabel ? `, ${a.toolLabel}` : ""}`}
                    style={{
                      display: "block", width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10,
                      cursor: "pointer", color: "#e8ecf2",
                      border: `1px solid ${on ? "rgba(94,155,255,0.6)" : "rgba(255,255,255,0.12)"}`,
                      background: on ? "rgba(94,155,255,0.14)" : "rgba(255,255,255,0.04)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span aria-hidden style={{ width: 9, height: 9, borderRadius: "50%", background: c, flexShrink: 0 }} />
                      <b style={{ fontSize: 13 }}>{displayName(a)}</b>
                      <span style={{ fontSize: 12, opacity: 0.65 }}>{role}</span>
                      <span style={{ marginLeft: "auto", fontSize: 12, color: c }}>{status}</span>
                    </div>
                    <div style={{ fontSize: 11.5, opacity: 0.75, marginTop: 4 }}>
                      {a.toolLabel ? `🧰 ${a.toolLabel}` : "—"}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                      {t("insp.context")} {fmtTok(a.inputTokens)} / {fmtTok(a.outputTokens)} {t("insp.output")}
                      {" · "}{t("insp.queue")} {a.turns}{" · "}{t("dash.colTools")} {a.toolCalls}{" · "}{t("insp.active")} {fmtDur(ms)}
                      {showCost && a.costUsd > 0 && <> {" · "}💰 ~{fmtCost(a.costUsd)}{a.model ? ` (${shortModel(a.model)})` : ""}</>}
                    </div>
                    {a.subagents.length > 0 && (
                      <div style={{ fontSize: 11, color: "#ffd60a", marginTop: 4 }}>
                        🌳 {t("insp.subagents")}: {a.subagents.map((s) => s.kind || s.label || t("bubble.helper")).join(", ")}
                      </div>
                    )}
                    {a.blocked && a.blockedReason && (
                      <div style={{ fontSize: 11, color: "#ff8a80", marginTop: 4, fontFamily: "ui-monospace, monospace" }}>
                        ⛔ {a.blockedReason}
                      </div>
                    )}
                  </button>
                  <div style={{ display: "flex", gap: 8, marginTop: 5 }}>
                    <button
                      onClick={() => send({ type: "focusAgent", id })}
                      style={{ padding: "5px 11px", borderRadius: 7, cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: "#fff", border: "1px solid rgba(94,155,255,0.5)", background: "rgba(94,155,255,0.18)" }}
                    >
                      {t("insp.terminal")}
                    </button>
                    <button
                      onClick={() => { send({ type: "closeAgent", id }); select(null); }}
                      style={{ padding: "5px 11px", borderRadius: 7, cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: "#fff", border: "1px solid rgba(255,69,58,0.45)", background: "rgba(255,69,58,0.12)" }}
                    >
                      {t("insp.close")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
