import { useState } from "react";
import { MAX_CONTEXT_TOKENS, presetFor, ROLE_PRESETS, STATUS_COLOR, STATUS_LABEL, tokenBar } from "../scene/roles";
import { useOffice } from "../store";
import { send } from "../transport";

// ── DOM overlay: sarlavha, +Agent, bo'sh holat, agent inspektori ──

const ROLES = Object.entries(ROLE_PRESETS).map(([key, p]) => ({ key, ...p }));

export default function Hud() {
  const order = useOffice((s) => s.order);
  const selectedId = useOffice((s) => s.selectedId);
  const agents = useOffice((s) => s.agents);
  const select = useOffice((s) => s.select);
  const cameraMode = useOffice((s) => s.cameraMode);
  const setCameraMode = useOffice((s) => s.setCameraMode);
  const [menu, setMenu] = useState(false);
  const sel = selectedId != null ? agents[selectedId] : undefined;

  const launch = (role?: string) => {
    send({ type: "launchAgent", role });
    setMenu(false);
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", fontFamily: "system-ui, sans-serif", color: "#e8ecf2" }}>
      {/* Yuqori panel */}
      <div style={{ position: "absolute", top: 12, left: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>🏢 Agent Office</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          {order.length} agent{order.length === 1 ? "" : "lar"}
        </div>
      </div>

      {/* Yuqori agent-bar (namunадеk — ismlar + status nuqta) */}
      {order.length > 0 && (
        <div
          style={{
            position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
            display: "flex", gap: 6, maxWidth: "60vw", overflowX: "auto", padding: 4, pointerEvents: "auto",
          }}
        >
          {order.map((id) => {
            const a = agents[id];
            if (!a) return null;
            const c = STATUS_COLOR[a.status];
            const on = selectedId === id;
            return (
              <button
                key={id}
                onClick={() => { select(a.id); send({ type: "focusAgent", id: a.id }); }}
                title={STATUS_LABEL[a.status]}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 20,
                  cursor: "pointer", whiteSpace: "nowrap", fontSize: 12, fontWeight: 600, color: "#e8ecf2",
                  border: `1px solid ${on ? c : "rgba(255,255,255,0.14)"}`,
                  background: on ? "rgba(94,155,255,0.22)" : "rgba(20,24,32,0.8)",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                {a.folderName}
              </button>
            );
          })}
        </div>
      )}

      {/* Kamera rejimi toggle */}
      <div style={{ position: "absolute", top: 12, right: 108, pointerEvents: "auto" }}>
        <button
          onClick={() => setCameraMode(cameraMode === "iso" ? "fpv" : "iso")}
          title={cameraMode === "iso" ? "Ichkidan yurib kuzatish" : "Yuqoridan (izometrik)"}
          style={{
            padding: "7px 12px", borderRadius: 9, cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.2)", background: "rgba(20,24,32,0.85)",
            color: "#fff", fontSize: 13, fontWeight: 600,
          }}
        >
          {cameraMode === "iso" ? "🚶 Ichki" : "🔭 Yuqori"}
        </button>
      </div>

      {/* FPV maslahatи */}
      {cameraMode === "fpv" && (
        <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", padding: "6px 14px", borderRadius: 10, background: "rgba(16,20,27,0.9)", color: "#e8ecf2", fontSize: 12, whiteSpace: "nowrap" }}>
          🖱 Qarash uchun bosing · <b>WASD</b> yurish · <b>Esc</b> chiqish
        </div>
      )}

      {/* +Agent */}
      <div style={{ position: "absolute", top: 12, right: 14, pointerEvents: "auto" }}>
        <button
          onClick={() => setMenu((m) => !m)}
          style={{
            padding: "7px 14px", borderRadius: 9, cursor: "pointer",
            border: "1px solid rgba(94,155,255,0.5)", background: "rgba(94,155,255,0.18)",
            color: "#fff", fontSize: 13, fontWeight: 600,
          }}
        >
          + Agent
        </button>
        {menu && (
          <div
            style={{
              position: "absolute", top: 40, right: 0, minWidth: 170,
              background: "rgba(18,22,29,0.97)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.6, padding: "4px 8px" }}>Rol tanlang</div>
            {ROLES.map((r) => (
              <button
                key={r.key}
                onClick={() => launch(r.key)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "7px 8px",
                  borderRadius: 7, border: "none", background: "transparent", color: "#e8ecf2",
                  fontSize: 13, cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: r.top, marginRight: 8 }} />
                {r.label}
              </button>
            ))}
            <button
              onClick={() => launch()}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "7px 8px", marginTop: 2,
                borderRadius: 7, border: "none", background: "transparent", color: "#9aa3af",
                fontSize: 12, cursor: "pointer",
              }}
            >
              Rolsiz ishga tushirish
            </button>
          </div>
        )}
      </div>

      {/* Bo'sh holat */}
      {order.length === 0 && (
        <div
          style={{
            position: "absolute", left: "50%", top: "58%", transform: "translate(-50%,-50%)",
            textAlign: "center", maxWidth: 340,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Ofis hozircha bo'sh</div>
          <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>
            <b>+ Agent</b> tugmасини bosing — yangi Claude Code terminali ochiladi va
            uning faoliyati shu ofisда jonli ko'rinadi.
          </div>
        </div>
      )}

      {/* Agent inspektor paneli (personaj tanlanганда) */}
      {sel && (
        <div
          style={{
            position: "absolute", bottom: 16, left: 16, width: 250, pointerEvents: "auto",
            background: "rgba(16,20,27,0.95)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12, padding: 14, boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{sel.folderName}</div>
            <button
              onClick={() => select(null)}
              style={{ border: "none", background: "transparent", color: "#9aa3af", cursor: "pointer", fontSize: 16 }}
            >
              ×
            </button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 1 }}>
            {presetFor(sel.role, sel.seatIndex).label}
          </div>
          <div style={{ fontSize: 12, marginTop: 8 }}>
            <span style={{ color: STATUS_COLOR[sel.status] }}>●</span> {STATUS_LABEL[sel.status]}
            {sel.toolLabel ? ` · ${sel.toolLabel}` : ""}
          </div>
          {sel.task && (
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, lineHeight: 1.4 }}>📋 {sel.task}</div>
          )}
          {/* Token kontekst */}
          {sel.inputTokens > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: 0.7, marginBottom: 3 }}>
                <span>Kontekst</span>
                <span>{Math.round((sel.inputTokens / MAX_CONTEXT_TOKENS) * 100)}% · {(sel.outputTokens / 1000).toFixed(1)}k chiqish</span>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.14)", overflow: "hidden" }}>
                <div style={{ width: `${Math.max(3, tokenBar(sel.inputTokens).pct * 100)}%`, height: "100%", background: tokenBar(sel.inputTokens).color }} />
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => send({ type: "focusAgent", id: sel.id })}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
                border: "1px solid rgba(94,155,255,0.5)", background: "rgba(94,155,255,0.18)", color: "#fff",
              }}
            >
              💻 Terminal
            </button>
            <button
              onClick={() => { send({ type: "closeAgent", id: sel.id }); select(null); }}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
                border: "1px solid rgba(255,69,58,0.5)", background: "rgba(255,69,58,0.15)", color: "#fff",
              }}
            >
              ✕ Yopish
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
