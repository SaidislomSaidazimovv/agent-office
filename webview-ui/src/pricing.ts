// ── Claude model narxlari (xarajat baholagichi) ─────────────
// Rasmiy Claude API narxlari (per 1M token). Taxmin QILINMAGAN — model
// hujjatidan olingan. Kesh yozish = kirish×1.25 (5 daq), kesh o'qish = kirish×0.1.
// Narx eskirishi mumkin — shuning uchun UI'da "~" (taxminiy) belgisi bor.
export const PRICING_AS_OF = "2026-07"; // narxlar shu sanaga

interface Rate { input: number; output: number } // $ / 1M token
// Model id substring bo'yicha moslanadi (variantlar: -1m, -fast, sanali).
const RATES: [string, Rate][] = [
  ["fable", { input: 10, output: 50 }],
  ["mythos", { input: 10, output: 50 }],
  ["opus", { input: 5, output: 25 }],   // 4.8 / 4.7 / 4.6 / 4.5
  ["sonnet", { input: 3, output: 15 }], // 5 / 4.6 / 4.5
  ["haiku", { input: 1, output: 5 }],   // 4.5
];
const DEFAULT: Rate = { input: 5, output: 25 }; // noma'lum → Opus-tier

function rateFor(model: string | undefined): Rate {
  if (!model) return DEFAULT;
  const m = model.toLowerCase();
  for (const [key, r] of RATES) if (m.includes(key)) return r;
  return DEFAULT;
}

export interface BilledTokens {
  input: number;      // keshlanmagan kirish
  cacheWrite: number; // kesh yozish (×1.25)
  cacheRead: number;  // kesh o'qish (×0.1)
  output: number;
}

/** Sessiya davomida jamlangan billing tokenlaridan taxminiy xarajat ($). */
export function estimateCost(model: string | undefined, t: BilledTokens): number {
  const r = rateFor(model);
  const dollars =
    (t.input * r.input + t.cacheWrite * r.input * 1.25 + t.cacheRead * r.input * 0.1 + t.output * r.output) / 1_000_000;
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
 *  Kesh o'qish kirish narxining 10%i, yozish esa 125%i. Ya'ni keshsiz o'sha
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
