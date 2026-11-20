import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Kun/tun sikli ────────────────────────────────────────────
// Mahalliy soatdan yorug'lik parametrlari. Mavzu (theme) ranglari ustiga
// KO'PAYTIRILADI — ustidan yozmaydi. Ofis hech qachon qorong'i bo'lmaydi
// (ambient minimal clamp). Kechqurun/tunda lampalar yonadi.

export interface DayParams {
  ambient: number;
  dirI: number;
  dir: string; // yo'naltirilgan yorug'lik rangi (hex)
  hemi: number;
  /** Atrof-muhit xaritasi (RoomEnvironment, lokal) kuchi — yumshoq hajm va aks. */
  env: number;
  sky: string; // fon rangi (hex)
  lamps: boolean; // lampalar/monitor porlashi kuchaysinmi
}

interface Key { h: number; amb: number; dirI: number; dir: [number, number, number]; hemi: number; env: number; sky: [number, number, number]; lamps: boolean }

// Kalit kadrlar (soat bo'yicha) — orasi silliq interpolatsiya qilinadi.
// S8-3: yassi "bir tekis" yoritish o'rniga — ambient/hemi past, quyosh kuchli
// (soya va hajm o'qiladi), yumshoq to'ldirish atrof-muhit xaritasidan (env).
const KEYS: Key[] = [
  { h: 0, amb: 0.30, dirI: 0.14, dir: [106, 122, 158], hemi: 0.22, env: 0.02, sky: [10, 14, 22], lamps: true },   // tun
  { h: 6, amb: 0.22, dirI: 0.70, dir: [255, 210, 158], hemi: 0.18, env: 0.08, sky: [42, 34, 46], lamps: true },   // tong
  { h: 8, amb: 0.14, dirI: 1.25, dir: [255, 240, 216], hemi: 0.14, env: 0.13, sky: [17, 21, 28], lamps: false },  // ertalab
  { h: 13, amb: 0.14, dirI: 1.50, dir: [255, 246, 232], hemi: 0.14, env: 0.15, sky: [18, 22, 30], lamps: false }, // tush
  { h: 18, amb: 0.20, dirI: 1.00, dir: [255, 154, 90], hemi: 0.16, env: 0.10, sky: [34, 22, 30], lamps: true },   // shom
  { h: 20, amb: 0.34, dirI: 0.30, dir: [200, 138, 106], hemi: 0.26, env: 0.05, sky: [14, 16, 26], lamps: true },  // kech
  { h: 24, amb: 0.30, dirI: 0.14, dir: [106, 122, 158], hemi: 0.22, env: 0.02, sky: [10, 14, 22], lamps: true },  // tun (wrap)
];

const hex = (c: [number, number, number]): string =>
  "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
  [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** Soat (0–24, kasrli) uchun yorug'lik parametrlari. */
export function daylightAt(hour: number): DayParams {
  const h = ((hour % 24) + 24) % 24;
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (h >= KEYS[i].h && h <= KEYS[i + 1].h) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const t = b.h === a.h ? 0 : (h - a.h) / (b.h - a.h);
  return {
    ambient: Math.max(0.08, mix(a.amb, b.amb, t)), // minimal yorqinlik clamp
    dirI: mix(a.dirI, b.dirI, t),
    dir: hex(mix3(a.dir, b.dir, t)),
    hemi: mix(a.hemi, b.hemi, t),
    env: mix(a.env, b.env, t),
    sky: hex(mix3(a.sky, b.sky, t)),
    lamps: t < 0.5 ? a.lamps : b.lamps,
  };
}

const DAY: DayParams = { ambient: 0.14, dirI: 1.5, dir: "#fff6e8", hemi: 0.14, env: 0.15, sky: "#11151c", lamps: false };

// `?hour=N` — sinov/qo'lda ko'rsatish uchun soatni majburlash.
function queryHour(): number | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("hour");
  if (q == null) return null;
  const n = Number(q);
  return Number.isFinite(n) ? n : null;
}

interface DaylightState {
  enabled: boolean;
  params: DayParams;
  toggle(): void;
  refresh(): void;
}

/** Kun/tun holati (zustand). `refresh()` real soatdan qayta hisoblaydi —
 *  soat sekin o'zgargani uchun kamdan-kam re-render. */
export const useDaylight = create<DaylightState>()(
  persist(
    (set, get) => ({
      enabled: true,
      // Boshlang'ich yorug'lik — JORIY vaqtdan (avval qat'iy DAY edi → yuklanganda
      // ~30s kunduzgi yorug'lik ko'rinardi, keyin refresh() to'g'rilar edi).
      params: currentParams(),
      toggle() {
        const enabled = !get().enabled;
        set({ enabled, params: enabled ? currentParams() : DAY });
      },
      refresh() {
        if (get().enabled) set({ params: currentParams() });
      },
    }),
    {
      name: "agent-office.daylight",
      // FAQAT yoqilgan/o'chirilgan holatni saqlaymiz — day/night o'chirilsa reload'da
      // qayta yoqilmasin. `params` esa real vaqtdan QAYTA hisoblanadi (eski saqlanmaydi).
      partialize: (s) => ({ enabled: s.enabled }),
      merge: (persisted, current) => {
        const enabled = (persisted as { enabled?: boolean } | null)?.enabled ?? true;
        return { ...current, enabled, params: enabled ? currentParams() : DAY };
      },
    },
  ),
);

function currentParams(): DayParams {
  const q = queryHour();
  if (q != null) return daylightAt(q);
  const d = new Date();
  return daylightAt(d.getHours() + d.getMinutes() / 60);
}
