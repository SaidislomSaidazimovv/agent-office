import type { AgentStatus } from "../store";

// ── Agent emotsiyalari ───────────────────────────────────────
// QOIDA: har bir emotsiya KUZATILGAN holatdan kelib chiqadi — kayfiyat o'ylab
// topilmaydi. Agent "xursand" yoki "charchagan" emas; u BLOKLANGAN, KONTEKSTI
// TO'LGAN, UZOQ O'YLAYAPTI yoki ISHNI TUGATDI. Har birining manbasi:
//   😖 blocked  → tool xato natija qaytardi (transkript: is_error)
//   🙋 stuck    → 3+ daqiqadan beri ruxsat kutmoqda (extension o'lchaydi)
//   🥵 hot      → kirish tokenlari kontekst oynasining 85%+ ini egalladi
//   🤔 think    → 25s+ uzluksiz "thinking" holatida
//   😌 done     → ish/o'ylash tugab, bo'sh holatga o'tdi
//   👋💬☕      → uchrashuv (presence) — alohida boshqariladi

/** Kontekst "qizigan" chegarasi — token satridagi ogohlantirish bilan bir xil. */
export const CONTEXT_HOT = 0.85;
/** Shuncha vaqt uzluksiz o'ylansa — 🤔 chiqadi. */
export const LONG_THINK_MS = 25000;
/** Vaqtinchalik emotsiyalar necha ms ko'rinadi. */
export const EMOTE_MS = { done: 3200, hot: 6000 } as const;

export function contextHot(inputTokens: number, contextWindow: number): boolean {
  if (!(contextWindow > 0)) return false;
  return inputTokens / contextWindow >= CONTEXT_HOT;
}

export interface EmoteInput {
  /** Uchrashuv emotsiyasi (bo'lsa — eng ustuvor: agent hozir gaplashyapti). */
  meeting?: string;
  status: AgentStatus;
  /** 3+ daqiqadan beri ruxsat kutmoqda — SIZNING javobingiz kerak. */
  stuck?: boolean;
  /** Kontekst yaqinda 85% dan oshdi (vaqtinchalik). */
  hot?: boolean;
  /** Taymer bilan qo'yilgan emotsiya (🤔 uzoq o'ylash / 😌 tugatdi). */
  timed?: string;
}

/** Ustuvorlik: uchrashuv → bloklangan → uzoq kutmoqda → kontekst to'ldi → taymerli. */
export function emoteFor(o: EmoteInput): string {
  if (o.meeting) return o.meeting;
  if (o.status === "blocked") return "😖";
  if (o.stuck) return "🙋"; // qo'l ko'targan — "meni unutdingiz"
  if (o.hot) return "🥵";
  return o.timed || "";
}
