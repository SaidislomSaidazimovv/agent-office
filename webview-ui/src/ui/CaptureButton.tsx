import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { canRecord, captureImage, CLIP_MS, recordClip } from "../media";

// ── 📸 Ofis surati / klipi ───────────────────────────────────
// Rasm — joriy kadr (PNG). Klip — 6s WebM (GIF emas: u tashqi kutubxona talab
// qiladi; WebM brauzerda tayyor). Ikkalasi ham FAQAT foydalanuvchi tanlagan
// joyga saqlanadi — hech qayerga jo'natilmaydi.

export default function CaptureButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [rec, setRec] = useState(false);
  const [left, setLeft] = useState(0);
  const [flash, setFlash] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  const ref = useRef<HTMLDivElement>(null);

  // Tashqariga bosish / Esc → yopish (boshqa panellar bilan bir xil)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  // Yozib olish tugagach ro'yxatdan chiqamiz (komponent yo'q bo'lsa ham to'xtasin)
  useEffect(() => () => stopRef.current(), []);

  const shot = () => {
    setOpen(false);
    if (!captureImage()) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 220); // qisqa "chaqnash" — surat olindi
  };

  const clip = () => {
    setOpen(false);
    if (rec) return;
    setRec(true);
    setLeft(Math.round(CLIP_MS / 1000));
    const tick = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    stopRef.current = recordClip(CLIP_MS, () => {
      clearInterval(tick);
      setRec(false);
      stopRef.current = () => {};
    });
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Surat olinganda ekran qisqa oqarib ketadi (kadr olingani bilinsin) */}
      {flash && <div style={{ position: "fixed", inset: 0, background: "#fff", opacity: 0.55, pointerEvents: "none", zIndex: 60, animation: "none" }} />}

      <button
        onClick={() => (rec ? stopRef.current() : setOpen((o) => !o))}
        aria-label={t("cap.open")}
        aria-pressed={open}
        title={rec ? t("cap.stop") : t("cap.open")}
        style={{
          pointerEvents: "auto", display: "flex", alignItems: "center", gap: 5, padding: "3px 7px", borderRadius: 8,
          cursor: "pointer", fontSize: 12, color: rec ? "#ff453a" : "#e8ecf2",
          border: `1px solid ${rec ? "rgba(255,69,58,0.6)" : open ? "rgba(94,155,255,0.6)" : "rgba(255,255,255,0.14)"}`,
          background: rec ? "rgba(255,69,58,0.16)" : open ? "rgba(94,155,255,0.22)" : "rgba(20,24,32,0.8)",
        }}
      >
        {rec ? <>⏹ {left}s</> : "📸"}
      </button>

      {open && !rec && (
        <div
          role="dialog"
          style={{
            position: "absolute", top: 38, left: 0, minWidth: 186, pointerEvents: "auto",
            background: "rgba(18,22,29,0.98)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10, padding: 6, boxShadow: "0 10px 28px rgba(0,0,0,0.5)", fontFamily: "system-ui",
          }}
        >
          <Item icon="🖼" label={t("cap.png")} onClick={shot} />
          <Item icon="🎬" label={t("cap.clip")} onClick={clip} disabled={!canRecord()} />
          <div style={{ fontSize: 9.5, opacity: 0.45, padding: "5px 8px 2px", lineHeight: 1.35 }}>{t("cap.hint")}</div>
        </div>
      )}
    </div>
  );
}

function Item({ icon, label, onClick, disabled }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
        padding: "7px 8px", borderRadius: 7, border: "none", cursor: disabled ? "default" : "pointer",
        background: "transparent", color: "#e8ecf2", fontSize: 12, opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = "rgba(94,155,255,0.18)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span>{icon}</span> {label}
    </button>
  );
}
