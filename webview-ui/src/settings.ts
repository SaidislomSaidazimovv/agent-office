import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Foydalanuvchi sozlamalari (localStorage'da saqlanadi) ────
// Til alohida store'da (i18n.ts) — u eng erta kerak. Qolgan sozlamalar shu yerda.
// QOIDA: bu yerdagi har bir sozlama HAQIQATAN biror narsani o'zgartiradi —
// bezak tugma yo'q. Qayerga ulanishi izohda ko'rsatilgan.

export type Quality = "high" | "low";

/** Sifat → piksel zichligi. Tejamkor: kamroq piksel = eng katta GPU yutug'i. */
export function dprFor(q: Quality): number {
  return q === "low" ? 0.7 : 1;
}
/** Sifat → soya xaritasining ZAXIRA yangilanishi (necha freymda bir). Asosiy
 *  yangilanish hodisaga bog'liq (sahnadagi statik narsa o'zgarganda —
 *  App.tsx `ShadowUpdater`); bu faqat mayda harakatlarni (o'simlik barglari)
 *  vaqti-vaqti bilan yangilab turadi. Avval har 4 freymda butun sahna soya
 *  o'tishida qayta chizilardi (~+50% draw call). */
export function shadowEvery(q: Quality): number {
  return q === "low" ? 240 : 120;
}

/** Soya xaritasini qayta chizishni talab qiladigan statik holat imzosi: har
 *  band o'rindiq (stol buyumlari — rolga xos buyum, krujka, tartibsizlik
 *  darajasi shundan chiziladi) va overflow stollar soni. Agentlarning o'zlari
 *  soya tashlamaydi (oyog'i ostida kontakt-soya bor) — ularning yurishi imzoga
 *  kirmaydi. Bir xil holat → bir xil satr (tartib barqaror). */
export function shadowSignature(agents: { seatIndex: number; role?: string; clutter: number }[]): string {
  return agents
    .map((a) => `${a.seatIndex}:${a.role ?? ""}:${a.clutter}`)
    .sort()
    .join("|");
}

/** Tizim "kamaytirilgan harakat"ni so'ragan bo'lsa — birinchi ishga tushishda yoqiq. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface SettingsValues {
  /** Sessiya xarajat budjeti ($). 0 = o'chiq. FAQAT ogohlantirish (budget.ts). */
  budgetUsd: number;
  /** Bo'sh turgandagi mayda animatsiyalar + o'simlik tebranishi (PixelPerson, OfficeDecor). */
  reducedMotion: boolean;
  /** Piksel zichligi + soya yangilanishi (App.tsx). */
  quality: Quality;
  /** Agent ustidagi rol yorlig'i (AgentAvatar). Ogohlantirish pufaklari baribir chiqadi. */
  showLabels: boolean;
  /** Bo'sh agent stolidan turib sayr qiladimi (AgentAvatar). */
  wander: boolean;
  /** Bo'sh agentlar uchrashadimi (AgentAvatar + presence). Sayr o'chiq bo'lsa ta'sirsiz. */
  social: boolean;
  /** Yuqori panel + inspektorda xarajat (Hud). Analitika panelida baribir ko'rinadi. */
  showCost: boolean;
  /** Kamera tanlangan agentni kuzatadi (App.tsx). */
  followSelected: boolean;
  /** Fokus rejimi: tanlangan agentdan boshqa hamma joy qorayadi (App.tsx). */
  focusMode: boolean;
  /** Matn rejimi (a11y): 3D o'rniga klaviatura bilan yuriladigan ro'yxat. */
  textMode: boolean;
  /** Kirish qo'llanmasi ko'rilganmi (Tour.tsx). Sozlamalar orqali qayta ko'rsa bo'ladi. */
  tourDone: boolean;
}

export type BoolSetting = {
  [K in keyof SettingsValues]: SettingsValues[K] extends boolean ? K : never;
}[keyof SettingsValues];

const DEFAULTS: SettingsValues = {
  budgetUsd: 0,
  reducedMotion: prefersReducedMotion(),
  quality: "high",
  showLabels: true,
  wander: true,
  social: true,
  showCost: true,
  followSelected: false,
  focusMode: false,
  textMode: false,
  tourDone: false,
};

interface SettingsState extends SettingsValues {
  setBudget(v: number): void;
  setQuality(q: Quality): void;
  toggle(key: BoolSetting): void;
  setTourDone(v: boolean): void;
  reset(): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      // Manfiy / NaN kiritilsa → 0 (o'chiq). Saqlangan qiymat hech qachon yaroqsiz bo'lmaydi.
      setBudget: (v) => set({ budgetUsd: Number.isFinite(v) && v > 0 ? v : 0 }),
      setQuality: (quality) => set({ quality }),
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Pick<SettingsValues, BoolSetting>),
      setTourDone: (tourDone) => set({ tourDone }),
      // "Standart" qo'llanmani QAYTA ochmaydi (bezovta qilmaslik uchun) — uni
      // sozlamalardagi alohida tugma qayta ishga tushiradi.
      reset: () => set({ ...DEFAULTS, reducedMotion: prefersReducedMotion(), tourDone: get().tourDone }),
    }),
    { name: "agent-office.settings" },
  ),
);
