import React, { useState } from "react";
import { colors, space, radii, font, panel, withAlpha } from "./theme.js";

// window.agentOffice — Electron preload orqali beriladi. Brauzerда undefined.
const api = typeof window !== "undefined" ? window.agentOffice : undefined;

// ── Loyiha boshqaruv paneli (faqat Electron ilovada) ─────────
// S2-0: papka tanlash. Keyingi bosqichlarда bu panel auth + vazifa
// yuborish boshqaruvi bilan kengayadi.
export default function ProjectBar() {
  const [dir, setDir] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!api?.isElectron) return null; // brauzerда ko'rinmaydi

  const pick = async () => {
    setBusy(true);
    try {
      const d = await api.openProject();
      if (d) setDir(d);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        ...panel,
        position: "absolute",
        bottom: space.xl,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: space.md,
        padding: `${space.sm}px ${space.md}px`,
        pointerEvents: "auto",
      }}
    >
      <button
        onClick={pick}
        disabled={busy}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: space.sm,
          padding: `${space.sm}px ${space.md}px`,
          borderRadius: radii.md,
          border: `1px solid ${withAlpha(colors.accent, 0.4)}`,
          background: withAlpha(colors.accent, 0.16),
          color: colors.textPrimary,
          fontSize: font.size.sm,
          fontWeight: font.weight.medium,
          cursor: busy ? "default" : "pointer",
        }}
      >
        📂 {dir ? "Boshqa loyiha" : "Loyihani ochish"}
      </button>
      <span
        style={{
          fontSize: font.size.sm,
          fontFamily: font.mono,
          color: dir ? colors.textSecondary : colors.textMuted,
          maxWidth: 460,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={dir || ""}
      >
        {dir || "Loyiha tanlanmagan"}
      </span>
    </div>
  );
}
