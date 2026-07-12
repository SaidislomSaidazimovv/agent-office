import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Foydalanuvchi sozlamalari (localStorage'da saqlanadi) ────
// Til alohida store'da (i18n.ts) — u eng erta kerak. Qolgan sozlamalar shu yerda.
// QOIDA: bu yerdagi har bir sozlama HAQIQATAN biror narsani o'zgartiradi —
// bezak tugma yo'q. Qayerga ulanishi izohда ko'rsatilgan.

export type Quality = "high" | "low";

/** Sifat → piksel zichligi. Tejamkor: kamroq piksel = eng katta GPU yutug'i. */
export function dprFor(q: Quality): number {
  return q === "low" ? 0.7 : 1;
}
/** Sifat → soya xaritasi necha freymда bir yangilanadi. */
export function shadowEvery(q: Quality): number {
  return q === "low" ? 12 : 4;
}

/** Tizim "kamaytirilgan harakat"ni so'ragan bo'lsa — birinchi ishga tushishда yoqiq. */
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
  /** Yuqori panel + inspektorда xarajat (Hud). Analitika panelida baribir ko'rinadi. */
  showCost: boolean;
  /** Kamera tanlangan agentni kuzatadi (App.tsx). */
  followSelected: boolean;
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
};

interface SettingsState extends SettingsValues {
  setBudget(v: number): void;
  setQuality(q: Quality): void;
  toggle(key: BoolSetting): void;
  reset(): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      // Manfiy / NaN kiritilsa → 0 (o'chiq). Saqlangan qiymat hech qachon yaroqsiz bo'lmaydi.
      setBudget: (v) => set({ budgetUsd: Number.isFinite(v) && v > 0 ? v : 0 }),
      setQuality: (quality) => set({ quality }),
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Pick<SettingsValues, BoolSetting>),
      reset: () => set({ ...DEFAULTS, reducedMotion: prefersReducedMotion() }),
    }),
    { name: "agent-office.settings" },
  ),
);
