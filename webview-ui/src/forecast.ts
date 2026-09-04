// ── Xarajat prognozi (sof funksiyalar) ──────────────────────
// `samples` — {t, cost, …} kumulyativ (cost faqat o'sadi). O'lchangan
// ma'lumotdan tezlik va budjetga yetish vaqtini hisoblaymiz — hech narsa
// to'qib chiqarilmaydi. DOM/store runtime'siz (faqat tur) → test qilinadi.

import type { CostSample } from "./store";

/** So'nggi `windowMs` oynasidagi xarajat tezligi ($/daqiqa). Namuna yetarli
 *  bo'lmasa yoki vaqt farqi nol bo'lsa 0. Cost kumulyativ — tezlik hech qачон
 *  manfiy emas. */
export function costVelocity(samples: CostSample[], windowMs = 300000): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  const cutoff = last.t - windowMs;
  // Oyna ичидаги ENG ERTA namuna (yoki oyna undan uzun bo'lsa — eng birinchisi).
  let first = samples[0];
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].t >= cutoff) { first = samples[i]; break; }
  }
  const dtMin = (last.t - first.t) / 60000;
  if (dtMin <= 0) return 0;
  return Math.max(0, (last.cost - first.cost) / dtMin);
}

/** Budjetga yetguncha qolgan vaqt (daqiqa). Budjet yo'q yoki tezlik ~0 → null.
 *  Allaqachon oshib ketgan → 0. */
export function timeToBudgetMin(spent: number, velocityPerMin: number, budget: number): number | null {
  if (!(budget > 0) || !Number.isFinite(budget) || velocityPerMin <= 0) return null;
  if (spent >= budget) return 0;
  return (budget - spent) / velocityPerMin;
}
