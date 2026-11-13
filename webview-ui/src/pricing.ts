// ── Claude model narxlari (xarajat baholagichi) ─────────────
// Narx jadvali YAGONA manbada — extension/core/pricing.ts (host ham shuni
// ishlatadi, rasmiy narxlar sahifasidan). Sessiya xarajatining o'zini HOST
// hisoblaydi (har javob o'z modeli, 5m/1h kesh, fast mode bilan) va
// agentTokenUsage.costUsd'da yuboradi; bu yerdagi estimateCost faqat zaxira
// (costUsd kelmasa) va kesh samaradorligi ko'rsatkichi uchun.
import { PRICING_AS_OF, rateFor } from "../../extension/core/pricing";

export { PRICING_AS_OF };

export interface BilledTokens {
  input: number;      // keshlanmagan kirish
  cacheWrite: number; // kesh yozish (×1.25)
  cacheRead: number;  // kesh o'qish (modelga bog'liq: ×0.025–×0.1)
  output: number;
}

/** Sessiya davomida jamlangan billing tokenlaridan taxminiy xarajat ($). */
export function estimateCost(model: string | undefined, t: BilledTokens): number {
  const r = rateFor(model);
  // Zaxira taxmin: kesh yozish 5 daqiqalik deb olinadi (1h bo'linishi faqat hostda bor).
  const dollars =
    (t.input * r.input + t.cacheWrite * r.input * 1.25 + t.cacheRead * r.input * r.readMul + t.output * r.output) / 1_000_000;
  return dollars;
}

export interface CacheStats {
  /** Kesh o'qish ulushi (0..1) — barcha kirish tokenlarining qanchasi keshdan kelgan. */
  hit: number;
  /** Kesh BO'LMAGANDA xarajat qancha bo'lardi ($). */
  naive: number;
  /** Haqiqiy taxminiy xarajat ($). */
  actual: number;
  /** Kesh TEJAB BERGAN mablag' ($). Manfiy ham bo'lishi mumkin — kesh yozilgan,
   *  lekin hech qachon o'qilmagan bo'lsa (yozish 25% qimmatroq). Yashirmaymiz. */
  saved: number;
}

/** Kesh samaradorligi — bir sessiya (yoki bir agent) uchun.
 *  Kesh o'qish kirish narxining modelga bog'liq ulushi (0.025×–0.1×), yozish 125%i. Ya'ni keshsiz o'sha
 *  tokenlar TO'LIQ narxda hisoblanardi — farqi haqiqiy tejamkorlik. */
export function cacheStats(model: string | undefined, t: BilledTokens): CacheStats {
  const r = rateFor(model);
  const all = t.input + t.cacheWrite + t.cacheRead;
  const actual = estimateCost(model, t);
  const naive = (all * r.input + t.output * r.output) / 1_000_000;
  return {
    hit: all > 0 ? t.cacheRead / all : 0,
    naive,
    actual,
    saved: naive - actual,
  };
}

/** Xarajatni ixcham formatlaydi: <$0.01 → "<¢1", <$1 → "12¢", aks holda "$1.23". */
export function fmtCost(dollars: number): string {
  if (dollars <= 0) return "$0";
  if (dollars < 0.01) return "<¢1";
  if (dollars < 1) return `${Math.round(dollars * 100)}¢`;
  return `$${dollars.toFixed(2)}`;
}
