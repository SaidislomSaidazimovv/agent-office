import React from "react";
import { useSim } from "../state/simulation.js";
import { STATUS, AGENTS } from "../config.js";
import { colors, space, radii, font, panel, withAlpha } from "./theme.js";

const fmtTokens = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n));

// ── Shared style atoms ───────────────────────────────────────
const eyebrow = { ...font.eyebrow };

const sectionLabel = { ...eyebrow, marginBottom: space.sm };

const StatusDot = ({ hex, size = 8, glow = true }) => (
  <span
    style={{
      width: size,
      height: size,
      borderRadius: radii.pill,
      background: hex,
      flexShrink: 0,
      boxShadow: glow ? `0 0 8px ${withAlpha(hex, 0.9)}` : "none",
    }}
  />
);

const StatusPill = ({ state }) => {
  const hex = colors.status[state];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: space.sm,
        padding: `${space.xs}px ${space.md}px`,
        borderRadius: radii.pill,
        fontSize: font.size.sm,
        fontWeight: font.weight.medium,
        color: hex,
        background: withAlpha(hex, 0.14),
        border: `1px solid ${withAlpha(hex, 0.32)}`,
      }}
    >
      <StatusDot hex={hex} size={7} glow={false} />
      {STATUS[state].label}
    </span>
  );
};

export default function Overlay() {
  const agents = useSim((s) => s.agents);
  const feed = useSim((s) => s.feed);
  const stats = useSim((s) => s.stats);
  const selectedId = useSim((s) => s.selectedId);
  const select = useSim((s) => s.select);
  const selected = agents.find((a) => a.id === selectedId);
  const active = agents.filter((a) => a.state !== "idle").length;

  const topStats = [
    { k: "Faol agentlar", v: String(active), suffix: ` / ${AGENTS.length}` },
    { k: "Bajarilgan", v: String(stats.done) },
    { k: "Tokenlar", v: fmtTokens(stats.tokens) },
  ];

  return (
    <>
      {/* ── Top bar: brand + live stats ─────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: `${space.lg}px ${space.xl}px`,
          pointerEvents: "none",
          background: `linear-gradient(${colors.bgScrim}, transparent)`,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: space.sm }}>
            <span className="ao-live-dot" />
            <span style={eyebrow}>Mission Control</span>
          </div>
          <div
            style={{
              fontSize: font.size.xl,
              fontWeight: font.weight.semibold,
              letterSpacing: "-0.02em",
              color: colors.textPrimary,
              marginTop: 2,
            }}
          >
            Agent Office
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: space.xl }}>
          {topStats.map((s, i) => (
            <React.Fragment key={s.k}>
              {i > 0 && (
                <span
                  style={{
                    width: 1,
                    alignSelf: "stretch",
                    background: colors.border,
                  }}
                />
              )}
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: font.size.xl,
                    fontWeight: font.weight.semibold,
                    color: colors.textPrimary,
                    letterSpacing: "-0.01em",
                    ...font.tabular,
                  }}
                >
                  {s.v}
                  {s.suffix && (
                    <span
                      style={{
                        color: colors.textMuted,
                        fontSize: font.size.md,
                        fontWeight: font.weight.medium,
                      }}
                    >
                      {s.suffix}
                    </span>
                  )}
                </div>
                <div style={{ ...eyebrow, marginTop: 3 }}>{s.k}</div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Status legend ───────────────────────────────────── */}
      <div
        style={{
          ...panel,
          position: "absolute",
          top: 88,
          right: space.xl,
          padding: `${space.md}px ${space.lg}px`,
          pointerEvents: "none",
        }}
      >
        <div style={sectionLabel}>Holatlar</div>
        <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
          {Object.entries(STATUS).map(([k, v]) => (
            <div
              key={k}
              style={{
                display: "flex",
                alignItems: "center",
                gap: space.sm,
                fontSize: font.size.sm,
                color: colors.textSecondary,
              }}
            >
              <StatusDot hex={colors.status[k]} />
              {v.label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Selected-agent detail ───────────────────────────── */}
      {selected && (
        <div
          className="ao-scroll"
          style={{
            ...panel,
            position: "absolute",
            top: 88,
            left: space.xl,
            width: 308,
            maxHeight: "calc(100vh - 128px)",
            overflowY: "auto",
            padding: space.xl,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: space.md,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: font.size.lg,
                  fontWeight: font.weight.semibold,
                  color: colors.textPrimary,
                  letterSpacing: "-0.01em",
                }}
              >
                {selected.name}
              </div>
              <div
                style={{
                  fontSize: font.size.sm,
                  color: colors.textSecondary,
                  marginTop: 1,
                }}
              >
                {selected.role}
              </div>
            </div>
            <button
              className="ao-close"
              onClick={() => select(null)}
              aria-label="Yopish"
            >
              ✕
            </button>
          </div>

          <div style={{ marginTop: space.md }}>
            <StatusPill state={selected.state} />
          </div>

          <div
            style={{
              height: 1,
              background: colors.border,
              margin: `${space.lg}px 0`,
            }}
          />

          <div style={sectionLabel}>Joriy vazifa</div>
          <div style={{ fontSize: font.size.md, color: colors.textPrimary }}>
            {selected.task || "—"}
          </div>
          {selected.task && (
            <div
              style={{
                marginTop: space.md,
                height: 5,
                borderRadius: radii.pill,
                background: colors.track,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.round(selected.progress)}%`,
                  height: "100%",
                  borderRadius: radii.pill,
                  background: colors.status[selected.state],
                  boxShadow: `0 0 10px ${withAlpha(colors.status[selected.state], 0.7)}`,
                  transition: "width 0.6s ease",
                }}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: space.xl, marginTop: space.lg }}>
            <div>
              <div style={eyebrow}>Model</div>
              <div
                style={{
                  fontSize: font.size.sm,
                  fontFamily: font.mono,
                  color: colors.textPrimary,
                  marginTop: space.xs,
                }}
              >
                {selected.model}
              </div>
            </div>
            <div>
              <div style={eyebrow}>Tokenlar</div>
              <div
                style={{
                  fontSize: font.size.sm,
                  color: colors.textPrimary,
                  marginTop: space.xs,
                  ...font.tabular,
                }}
              >
                {fmtTokens(selected.tokens)}
              </div>
            </div>
          </div>

          <div style={{ ...sectionLabel, marginTop: space.lg }}>
            So'nggi loglar
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
            {selected.logs.map((l, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: space.sm,
                  fontSize: font.size.sm,
                  lineHeight: 1.35,
                  color: i === 0 ? colors.textPrimary : colors.textMuted,
                }}
              >
                <span style={{ color: colors.accent, flexShrink: 0 }}>›</span>
                <span>{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Live event feed ─────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: space.xl,
          width: 390,
          maxWidth: "70vw",
          display: "flex",
          flexDirection: "column-reverse",
          gap: space.sm,
          pointerEvents: "none",
        }}
      >
        {feed.map((e, i) => (
          <div
            key={e.id}
            style={{
              fontSize: font.size.sm,
              color: colors.textSecondary,
              opacity: 1 - i * 0.13,
              background: colors.chip,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: `1px solid ${colors.border}`,
              borderLeft: `2px solid ${colors.borderStrong}`,
              borderRadius: radii.sm,
              padding: `${space.sm}px ${space.md}px`,
            }}
          >
            <span style={{ color: colors.textMuted, ...font.tabular }}>
              {e.time}
            </span>
            {"  "}
            <span
              style={{ fontWeight: font.weight.semibold, color: colors.textPrimary }}
            >
              {e.agentName}
            </span>{" "}
            {e.verb}{" "}
            <span style={{ color: colors.textSecondary }}>{e.extra}</span>
          </div>
        ))}
        {/* Header renders on top (column-reverse: last child = top). */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: space.sm,
            marginBottom: space.xs,
          }}
        >
          <span className="ao-live-dot" />
          <span style={eyebrow}>Jonli oqim</span>
        </div>
      </div>

      {/* ── Controls hint ───────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          right: space.xl,
          fontSize: font.size.xs,
          lineHeight: 1.6,
          color: colors.textMuted,
          pointerEvents: "none",
          textAlign: "right",
        }}
      >
        Aylantirish — torting · Zoom — g'ildirak
        <br />
        Xodim tafsiloti — ustiga bosing
      </div>
    </>
  );
}
