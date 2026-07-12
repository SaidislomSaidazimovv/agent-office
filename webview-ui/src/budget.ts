// ── Xarajat budjeti ──────────────────────────────────────────
// MUHIM: bu FAQAT OGOHLANTIRISH. Kengaytma kuzatuvchi — u agentni to'xtata
// olmaydi va to'xtatmaydi ham (API kalitiga tegmaydi, sessiyani boshqarmaydi).
// Budjet — foydalanuvchi o'zi ko'rib turishi uchun chegara.

export type BudgetLevel = "off" | "ok" | "warn" | "over";

/** Ogohlantirish chegarasi — budjetning shu ulushidan oshsa "warn". */
export const BUDGET_WARN = 0.8;

// Semantik ranglar (kategorik EMAS — HUD, dashboard va bildirishnomada bir xil).
export const BUDGET_COLOR: Record<BudgetLevel, string> = {
  off: "#30d158",
  ok: "#30d158",
  warn: "#ff9f0a",
  over: "#ff453a",
};

export interface BudgetState {
  level: BudgetLevel;
  /** Ishlatilgan ulush (0..∞; 1.0 = budjet to'liq sarflandi). Budjet yo'q → 0. */
  frac: number;
  /** Qolgan mablag' ($) — oshib ketgan bo'lsa 0. */
  left: number;
  color: string;
}

/** Sarflangan va limitdan budjet holatini hisoblaydi (sof funksiya). */
export function budgetState(spent: number, limit: number): BudgetState {
  if (!(limit > 0) || !Number.isFinite(limit)) {
    return { level: "off", frac: 0, left: 0, color: BUDGET_COLOR.off };
  }
  const s = Math.max(0, spent);
  const frac = s / limit;
  const level: BudgetLevel = frac >= 1 ? "over" : frac >= BUDGET_WARN ? "warn" : "ok";
  return { level, frac, left: Math.max(0, limit - s), color: BUDGET_COLOR[level] };
}
