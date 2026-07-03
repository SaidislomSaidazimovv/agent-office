import { useState } from "react";
import { ROLE_PRESETS } from "../scene/roles";
import { useOffice } from "../store";
import { send } from "../transport";

// ── DOM overlay: sarlavha, +Agent (rol tanlash), bo'sh holat ──

const ROLES = Object.values(ROLE_PRESETS);

export default function Hud() {
  const order = useOffice((s) => s.order);
  const [menu, setMenu] = useState(false);

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
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: r.colors.top, marginRight: 8 }} />
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
    </div>
  );
}
