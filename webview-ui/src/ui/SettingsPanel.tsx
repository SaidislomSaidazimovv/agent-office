import { useEffect, useRef, useState } from "react";
import { type Key, LANGS, useLang, useT } from "../i18n";
import { unlockAudio } from "../notificationSound";
import { useDaylight } from "../scene/daylight";
import { type BoolSetting, useSettings } from "../settings";
import { useOffice } from "../store";
import { send } from "../transport";

// ── Sozlamalar paneli — gear ikonka + popover ────────────────
// Bo'limlar: Til · Ko'rinish · Harakat · Unumdorlik · Xarajat.
// Har bir tugma HAQIQATAN biror narsani o'zgartiradi (settings.ts izohiga qarang).

export default function SettingsPanel() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const daylightOn = useDaylight((s) => s.enabled);
  const toggleDaylight = useDaylight((s) => s.toggle);
  const soundEnabled = useOffice((s) => s.soundEnabled);
  const setSound = useOffice((s) => s.setSound);

  const cfg = useSettings();
  const { budgetUsd, quality, setBudget, setQuality, toggle, reset } = cfg;
  // Kiritish maydoni xom matnda ("" va "0." kabi oraliq holatlar uchun); store'ga
  // esa faqat yaroqli son yoziladi (yaroqsiz → 0 = o'chiq).
  const [budgetDraft, setBudgetDraft] = useState(budgetUsd > 0 ? String(budgetUsd) : "");

  // Tashqariga bosish / Esc → yopish
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggleSound = () => { const n = !soundEnabled; setSound(n); if (n) unlockAudio(); send({ type: "setSoundEnabled", enabled: n }); };
  const resetAll = () => { reset(); setBudgetDraft(""); };
  const flag = (key: BoolSetting, labelKey: Key, icon: string, hintKey?: Key) => (
    <Toggle label={t(labelKey)} hint={hintKey ? t(hintKey) : undefined} icon={icon} on={cfg[key]} onClick={() => toggle(key)} />
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("settings.open")}
        aria-pressed={open}
        title={t("settings.open")}
        style={{
          pointerEvents: "auto", display: "flex", alignItems: "center", padding: "3px 7px", borderRadius: 8,
          cursor: "pointer", fontSize: 13, color: "#e8ecf2",
          border: `1px solid ${open ? "rgba(94,155,255,0.5)" : "rgba(255,255,255,0.14)"}`,
          background: open ? "rgba(94,155,255,0.2)" : "rgba(20,24,32,0.8)",
        }}
      >
        ⚙
      </button>

      {open && (
        <div
          role="dialog"
          style={{
            position: "absolute", top: 38, right: 0, width: 244, maxHeight: "76vh", overflowY: "auto", pointerEvents: "auto",
            background: "rgba(18,22,29,0.98)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12, padding: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.55)",
            fontFamily: "system-ui", color: "#e8ecf2",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{t("settings.title")}</span>
            <button
              onClick={resetAll}
              title={t("settings.reset")}
              style={{ padding: "3px 7px", borderRadius: 7, cursor: "pointer", fontSize: 10.5, color: "#9aa3af", border: "1px solid rgba(255,255,255,0.12)", background: "transparent" }}
            >
              ↺ {t("settings.reset")}
            </button>
          </div>

          {/* Til */}
          <Section title={t("settings.language")} />
          <div style={{ display: "flex", gap: 5, marginBottom: 4 }}>
            {LANGS.map((l) => (
              <button
                key={l.key}
                onClick={() => setLang(l.key)}
                style={{
                  flex: 1, padding: "6px 4px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600,
                  border: `1px solid ${lang === l.key ? "rgba(94,155,255,0.6)" : "rgba(255,255,255,0.12)"}`,
                  background: lang === l.key ? "rgba(94,155,255,0.24)" : "transparent", color: "#e8ecf2",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                }}
              >
                <span style={{ fontSize: 15 }}>{l.flag}</span>
                {l.label}
              </button>
            ))}
          </div>

          {/* Ko'rinish */}
          <Section title={t("settings.groupLook")} />
          <Toggle label={t("settings.daylight")} icon={daylightOn ? "🌗" : "☀️"} on={daylightOn} onClick={toggleDaylight} />
          {flag("showLabels", "settings.labels", "🏷️")}
          {flag("showCost", "settings.showCost", "💵", "settings.showCostHint")}

          {/* Harakat */}
          <Section title={t("settings.groupMotion")} />
          {flag("reducedMotion", "settings.reducedMotion", "🌀", "settings.reducedMotionHint")}
          {flag("wander", "settings.wander", "🚶")}
          {flag("social", "settings.social", "💬", "settings.socialHint")}
          {flag("followSelected", "settings.follow", "🎥")}

          {/* Unumdorlik */}
          <Section title={t("settings.groupPerf")} />
          <div style={{ display: "flex", gap: 5 }}>
            {(["high", "low"] as const).map((q) => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                aria-pressed={quality === q}
                style={{
                  flex: 1, padding: "7px 4px", borderRadius: 8, cursor: "pointer", fontSize: 11.5, fontWeight: 600,
                  border: `1px solid ${quality === q ? "rgba(94,155,255,0.6)" : "rgba(255,255,255,0.12)"}`,
                  background: quality === q ? "rgba(94,155,255,0.24)" : "transparent", color: "#e8ecf2",
                }}
              >
                {q === "high" ? `✨ ${t("settings.qualityHigh")}` : `🍃 ${t("settings.qualityLow")}`}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, opacity: 0.5, marginTop: 5, lineHeight: 1.35 }}>{t("settings.qualityHint")}</div>

          {/* Xarajat */}
          <Section title={t("settings.groupCost")} />
          <Toggle label={t("settings.sound")} icon={soundEnabled ? "🔊" : "🔇"} on={soundEnabled} onClick={toggleSound} />
          <label htmlFor="ao-budget" style={{ display: "block", fontSize: 11, opacity: 0.6, margin: "9px 0 5px" }}>💸 {t("budget.label")}</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 9px", borderRadius: 8, border: `1px solid ${budgetUsd > 0 ? "rgba(94,155,255,0.5)" : "rgba(255,255,255,0.12)"}`, background: "rgba(0,0,0,0.25)" }}>
            <span style={{ fontSize: 12, opacity: 0.55 }}>$</span>
            <input
              id="ao-budget"
              type="number"
              min={0}
              step={0.5}
              value={budgetDraft}
              placeholder="0"
              onChange={(e) => { setBudgetDraft(e.target.value); setBudget(parseFloat(e.target.value)); }}
              style={{ flex: 1, width: "100%", minWidth: 0, padding: "7px 0", border: "none", outline: "none", background: "transparent", color: "#e8ecf2", fontSize: 12.5, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
            />
          </div>
          <div style={{ fontSize: 10, opacity: 0.5, marginTop: 5, lineHeight: 1.35 }}>{t("budget.hint")}</div>
        </div>
      )}
    </div>
  );
}

function Section({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "12px 0 6px" }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.45, whiteSpace: "nowrap" }}>{title}</span>
      <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
    </div>
  );
}

function Toggle({ label, hint, on, onClick, icon }: { label: string; hint?: string; on: boolean; onClick: () => void; icon: string }) {
  return (
    <>
      <button
        onClick={onClick}
        aria-pressed={on}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 8,
          padding: "8px 10px", marginTop: 4, borderRadius: 8, cursor: "pointer", fontSize: 12, color: "#e8ecf2",
          border: "1px solid rgba(255,255,255,0.1)", background: "transparent", textAlign: "left",
        }}
      >
        <span>{icon} {label}</span>
        <span style={{
          width: 34, height: 18, borderRadius: 10, position: "relative", flexShrink: 0,
          background: on ? "rgba(94,155,255,0.7)" : "rgba(255,255,255,0.15)", transition: "background 0.15s",
        }}>
          <span style={{
            position: "absolute", top: 2, left: on ? 18 : 2, width: 14, height: 14, borderRadius: "50%",
            background: "#fff", transition: "left 0.15s",
          }} />
        </span>
      </button>
      {hint && <div style={{ fontSize: 9.5, opacity: 0.45, padding: "3px 10px 0", lineHeight: 1.35 }}>{hint}</div>}
    </>
  );
}
