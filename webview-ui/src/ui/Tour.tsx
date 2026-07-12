import { useEffect, useLayoutEffect, useState } from "react";
import { type Key, useT } from "../i18n";
import { useSettings } from "../settings";

// ── Kirish qo'llanmasi (onboarding) ──────────────────────────
// Birinchi ochilishda bir marta ko'rinadi; ⚙ sozlamalardan qayta ishga tushadi.
// Nishon element `data-tour` atributi bilan topiladi — element yo'q bo'lsa
// (masalan hali agent yo'q → agent paneli chizilmagan) qadam MARKAZDA ko'rsatiladi
// (hech qachon bo'sh joyni yoritib qolmaydi).

interface Step {
  target?: string; // data-tour qiymati
  title: Key;
  body: Key;
}
const STEPS: Step[] = [
  { title: "tour.welcome.t", body: "tour.welcome.b" },
  { target: "add-agent", title: "tour.add.t", body: "tour.add.b" },
  { target: "agents", title: "tour.agents.t", body: "tour.agents.b" },
  { target: "dash", title: "tour.dash.t", body: "tour.dash.b" },
  { target: "settings", title: "tour.settings.t", body: "tour.settings.b" },
  { target: "camera", title: "tour.camera.t", body: "tour.camera.b" },
];

interface Rect { x: number; y: number; w: number; h: number }
const PAD = 6;
const CARD_W = 292;

function rectOf(target?: string): Rect | null {
  if (!target) return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { x: r.x - PAD, y: r.y - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
}

export default function Tour({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  // Nishon o'lchamini har qadamda (va oyna o'lchami o'zgarganda) qayta o'lchaymiz.
  useLayoutEffect(() => {
    const measure = () => setRect(rectOf(step.target));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" || e.key === "ArrowRight") setI((n) => (n + 1 < STEPS.length ? n + 1 : n));
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Kartochka: nishon ostida (joy bo'lmasa — ustida). Nishon yo'q → markazda.
  const vw = window.innerWidth, vh = window.innerHeight;
  let card: React.CSSProperties;
  if (rect) {
    const below = rect.y + rect.h + 12;
    const fits = below + 190 < vh;
    card = {
      left: Math.min(Math.max(12, rect.x + rect.w / 2 - CARD_W / 2), vw - CARD_W - 12),
      top: fits ? below : Math.max(12, rect.y - 190),
    };
  } else {
    card = { left: vw / 2 - CARD_W / 2, top: vh / 2 - 100 };
  }

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 50, pointerEvents: "auto", fontFamily: "system-ui", color: "#e8ecf2" }}>
      {/* Qorong'ilashtirish: nishon bo'lsa — "teshik" (katta spread soya), aks holda tekis. */}
      {rect ? (
        <div
          style={{
            position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h,
            borderRadius: 12, border: "2px solid rgba(94,155,255,0.9)",
            boxShadow: "0 0 0 9999px rgba(6,9,14,0.72), 0 0 22px rgba(94,155,255,0.45)",
            transition: "left 180ms ease, top 180ms ease, width 180ms ease, height 180ms ease",
          }}
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "rgba(6,9,14,0.72)" }} />
      )}

      {/* Qadam kartochkasi */}
      <div
        role="dialog"
        aria-label={t("tour.title")}
        style={{
          position: "absolute", width: CARD_W, ...card,
          background: "rgba(18,22,29,0.99)", border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: 14, padding: 14, boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>{t(step.title)}</div>
        <div style={{ fontSize: 12, opacity: 0.78, lineHeight: 1.5 }}>{t(step.body)}</div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 13 }}>
          {/* Qadam nuqtalari */}
          <div style={{ display: "flex", gap: 4, flex: 1 }}>
            {STEPS.map((_, n) => (
              <span key={n} style={{ width: n === i ? 14 : 5, height: 5, borderRadius: 3, background: n === i ? "#5e9bff" : "rgba(255,255,255,0.24)", transition: "width 150ms" }} />
            ))}
          </div>
          {!last && (
            <button onClick={onClose} style={{ padding: "5px 9px", borderRadius: 7, cursor: "pointer", fontSize: 11, color: "#9aa3af", border: "1px solid rgba(255,255,255,0.12)", background: "transparent" }}>
              {t("tour.skip")}
            </button>
          )}
          <button
            onClick={() => (last ? onClose() : setI(i + 1))}
            style={{ padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: "#fff", border: "1px solid rgba(94,155,255,0.6)", background: "rgba(94,155,255,0.26)" }}
          >
            {last ? t("tour.done") : t("tour.next")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Qo'llanma birinchi ochilishda bir marta ko'rinadi (yoki sozlamadan qayta ishga tushirilsa). */
export function useTour(): { open: boolean; close: () => void } {
  const tourDone = useSettings((s) => s.tourDone);
  const setTourDone = useSettings((s) => s.setTourDone);
  return { open: !tourDone, close: () => setTourDone(true) };
}
