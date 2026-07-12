import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Foydalanuvchi sozlamalari (localStorage'da saqlanadi) ────
// Til alohida store'da (i18n.ts) — u eng erta kerak bo'ladi. Bu yerda esa
// qolgan barcha sozlamalar to'planadi.

interface SettingsState {
  /** Sessiya xarajat budjeti ($). 0 = o'chiq. Faqat ogohlantirish — hech narsa to'xtatilmaydi. */
  budgetUsd: number;
  setBudget(v: number): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      budgetUsd: 0,
      // Manfiy / NaN kiritilsa → 0 (o'chiq). Saqlangan qiymat hech qachon yaroqsiz bo'lmaydi.
      setBudget: (v) => set({ budgetUsd: Number.isFinite(v) && v > 0 ? v : 0 }),
    }),
    { name: "agent-office.settings" },
  ),
);
