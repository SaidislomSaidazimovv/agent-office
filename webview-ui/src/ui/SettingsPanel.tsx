import { useEffect, useRef, useState } from "react";
import { LANGS, useLang, useT } from "../i18n";
import { unlockAudio } from "../notificationSound";
import { useDaylight } from "../scene/daylight";
import { useOffice } from "../store";
import { send } from "../transport";

// ── Sozlamalar paneli — gear ikonka + popover (til + kun/tun + ovoz) ──
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
            position: "absolute", top: 38, right: 0, minWidth: 220, pointerEvents: "auto",
            background: "rgba(18,22,29,0.98)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12, padding: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.55)",
            fontFamily: "system-ui", color: "#e8ecf2",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{t("settings.title")}</div>

          {/* Til */}
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 5 }}>{t("settings.language")}</div>
          <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
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

          {/* Toggle'lar */}
          <Toggle label={t("settings.daylight")} on={daylightOn} onClick={toggleDaylight} icon={daylightOn ? "🌗" : "☀️"} />
          <Toggle label={t("settings.sound")} on={soundEnabled} onClick={toggleSound} icon={soundEnabled ? "🔊" : "🔇"} />
        </div>
      )}
    </div>
  );
}

function Toggle({ label, on, onClick, icon }: { label: string; on: boolean; onClick: () => void; icon: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
        padding: "8px 10px", marginTop: 4, borderRadius: 8, cursor: "pointer", fontSize: 12, color: "#e8ecf2",
        border: "1px solid rgba(255,255,255,0.1)", background: "transparent",
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
  );
}
