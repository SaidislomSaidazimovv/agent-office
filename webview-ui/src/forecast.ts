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

export interface AgentEff {
  /** Bir tool chaqiruviga o'rtacha xarajat ($). */
  costPerTool: number;
  /** Bir navbatga (turn) o'rtacha token (kirish+chiqish). */
  tokensPerTurn: number;
  /** Faol ulush (0..1) — faollik ritmi namunalarining qanchasi faol edi. */
  activeRatio: number;
}

/** Agent samaradorligi — o'lchangan hisoblardan (bo'luvchi 0 bo'lsa 0). */
export function agentEfficiency(a: {
  costUsd: number; toolCalls: number; turns: number; inputTokens: number; outputTokens: number; activity: number[];
}): AgentEff {
  return {
    costPerTool: a.toolCalls > 0 ? a.costUsd / a.toolCalls : 0,
    tokensPerTurn: a.turns > 0 ? (a.inputTokens + a.outputTokens) / a.turns : 0,
    activeRatio: a.activity.length > 0 ? a.activity.reduce((s, v) => s + v, 0) / a.activity.length : 0,
  };
}
