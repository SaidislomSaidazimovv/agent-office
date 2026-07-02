import React from "react";
import { useSim } from "../state/simulation.js";
import { STATUS, AGENTS } from "../config.js";

const fmtTokens = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n));

const panel = {
  background: "rgba(12,15,20,0.82)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 14,
};

export default function Overlay() {
  const agents = useSim((s) => s.agents);
  const feed = useSim((s) => s.feed);
  const stats = useSim((s) => s.stats);
  const selectedId = useSim((s) => s.selectedId);
  const select = useSim((s) => s.select);
  const selected = agents.find((a) => a.id === selectedId);
  const active = agents.filter((a) => a.state !== "idle").length;

  return (
    <>
      {/* Yuqori panel */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 24px", pointerEvents: "none",
        background: "linear-gradient(rgba(8,10,14,0.6), transparent)",
      }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.18em", color: "#B4BBC7", fontWeight: 500 }}>MISSION CONTROL</div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Agent Office</div>
        </div>
        <div style={{ display: "flex", gap: 28 }}>
          {[
            { k: "Faol agentlar", v: `${active} / ${AGENTS.length}` },
            { k: "Bajarilgan", v: stats.done },
            { k: "Tokenlar", v: fmtTokens(stats.tokens) },
          ].map((s) => (
            <div key={s.k} style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{s.v}</div>
              <div style={{ fontSize: 11, color: "#B4BBC7" }}>{s.k}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ ...panel, position: "absolute", top: 84, right: 24, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7, pointerEvents: "none" }}>
        {Object.entries(STATUS).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#D8DDE5" }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: v.hex, boxShadow: `0 0 6px ${v.hex}` }} />
            {v.label}
          </div>
        ))}
      </div>

      {/* Agent paneli */}
      {selected && (
        <div style={{ ...panel, position: "absolute", top: 84, left: 24, width: 300, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{selected.name}</div>
              <div style={{ fontSize: 12, color: "#B4BBC7" }}>{selected.role}</div>
            </div>
            <button onClick={() => select(null)} style={{
              background: "rgba(255,255,255,0.1)", border: "none", color: "#D8DDE5",
              width: 26, height: 26, borderRadius: 13, cursor: "pointer", fontSize: 13,
            }}>✕</button>
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7, marginTop: 12,
            padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500,
            background: `${STATUS[selected.state].hex}22`, color: STATUS[selected.state].hex,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: STATUS[selected.state].hex }} />
            {STATUS[selected.state].label}
          </div>
          <div style={{ marginTop: 14, fontSize: 12, color: "#B4BBC7" }}>Joriy vazifa</div>
          <div style={{ fontSize: 14, marginTop: 3 }}>{selected.task || "—"}</div>
          {selected.task && (
            <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)" }}>
              <div style={{
                width: `${Math.round(selected.progress)}%`, height: "100%", borderRadius: 2,
                background: STATUS[selected.state].hex, transition: "width 0.6s ease",
              }} />
            </div>
          )}
          <div style={{ display: "flex", gap: 18, marginTop: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: "#B4BBC7" }}>Model</div>
              <div style={{ fontSize: 12, fontFamily: "ui-monospace, monospace" }}>{selected.model}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#B4BBC7" }}>Tokenlar</div>
              <div style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtTokens(selected.tokens)}</div>
            </div>
          </div>
          <div style={{ marginTop: 14, fontSize: 11, color: "#B4BBC7" }}>So'nggi loglar</div>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 5 }}>
            {selected.logs.map((l, i) => (
              <div key={i} style={{ fontSize: 12, color: i === 0 ? "#EDF0F5" : "#B4BBC7" }}>· {l}</div>
            ))}
          </div>
        </div>
      )}

      {/* Event feed */}
      <div style={{
        position: "absolute", bottom: 20, left: 24, width: 390, maxWidth: "70vw",
        display: "flex", flexDirection: "column-reverse", gap: 6, pointerEvents: "none",
      }}>
        {feed.map((e, i) => (
          <div key={e.id} style={{
            fontSize: 12.5, color: "#D8DDE5", opacity: 1 - i * 0.13,
            background: "rgba(12,15,20,0.66)", backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "6px 10px",
          }}>
            <span style={{ color: "#818999", fontVariantNumeric: "tabular-nums" }}>{e.time}</span>{"  "}
            <span style={{ fontWeight: 600, color: "#F5F7FA" }}>{e.agentName}</span> {e.verb}{" "}
            <span style={{ color: "#B4BBC7" }}>{e.extra}</span>
          </div>
        ))}
      </div>

      <div style={{
        position: "absolute", bottom: 20, right: 24, fontSize: 11.5, color: "#818999",
        pointerEvents: "none", textAlign: "right",
      }}>
        Aylantirish — torting · Zoom — g'ildirak<br />
        Xodim tafsiloti — ustiga bosing
      </div>
    </>
  );
}
