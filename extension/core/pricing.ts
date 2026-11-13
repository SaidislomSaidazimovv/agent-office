// ── Claude narxlari — YAGONA manba (host + webview shu faylni ishlatadi) ──
// Manba: rasmiy narxlar sahifasi https://platform.claude.com/docs/en/about-claude/pricing
// (2026-11-13 da o'qildi). Hech qaysi raqam taxmin qilinmagan; ro'yxatda
// bo'lmagan model oilasining eng yangi ma'lum narxiga tushadi (UI "~" — taxminiy).
//
// Tuzilma (sahifadagidek):
//   • kesh yozish: 5 daqiqalik = kirish × 1.25, 1 soatlik = kirish × 2;
//   • kesh o'qish: modelga bog'liq ko'paytuvchi (0.025× / 0.05× / 0.1×);
//   • fast mode: alohida kirish/chiqish narxi, kesh ko'paytuvchilari USTIGA qo'llanadi;
//   • Haiku 5.5: prompt (kirish + kesh o'qish + kesh yozish) 100 000 tokendan oshsa —
//     yuqori narx, har so'rov alohida baholanadi;
//   • inference_geo "us" (Claude 4.6+): barcha toifalarga × 1.1;
//   • web search: 1000 qidiruv uchun $10.
// DOM/Node'siz sof modul — test qilinadi.
//
// MA'LUM CHEKLOV (2026-11-13 da haqiqiy transkriptlarda tekshirilgan): Claude
// Code ba'zi so'rovlarni transkriptga assistant javobi sifatida YOZMAYDI —
// masalan "away summary" (system:away_summary), xato bilan tugagan/qayta
// urinilgan so'rovlar. Ular pul turadi va Claude Code'ning o'z `cost-state`
// jamiga kiradi, lekin bu yerda ko'rinmaydi. Bitta toza sessiyada farq 0.8%,
// ikkita qisqa sessiyada 8–12% (bizniki kam) chiqdi. `cost-state` yozuvi esa
// jonli manba bo'la olmaydi (tartibsiz yoziladi, vaqt belgisi yo'q, /resume'da
// tiklanadi) — shuning uchun bu cheklov UI'da ochiq aytiladi.

export const PRICING_AS_OF = "2026-11-13";

/** $ / 1M token. */
export interface Rate {
  input: number;
  output: number;
  /** Kesh o'qish = input × shu ko'paytuvchi. */
  readMul: number;
  /** Fast mode (usage.speed === "fast") kirish/chiqish narxi. */
  fast?: { input: number; output: number };
  /** Uzun prompt narxi (Haiku 5.5): prompt shu tokendan oshsa. */
  longPrompt?: { over: number; input: number; output: number };
}

// Tartib muhim: aniqroq id oldin ("opus-5-5" "opus-5"dan oldin).
const RATES: [RegExp, Rate][] = [
  [/(fable|mythos)-5-2/, { input: 8, output: 40, readMul: 0.025, fast: { input: 16, output: 80 } }],
  [/(fable|mythos)-5-1/, { input: 10, output: 50, readMul: 0.025 }],
  [/(fable|mythos)-5(?!-\d)/, { input: 10, output: 50, readMul: 0.1 }],
  [/opus-5-5/, { input: 4, output: 20, readMul: 0.05, fast: { input: 8, output: 40 } }],
  [/opus-5(?!-\d)/, { input: 5, output: 25, readMul: 0.1, fast: { input: 10, output: 50 } }],
  [/opus-4-8/, { input: 5, output: 25, readMul: 0.1, fast: { input: 10, output: 50 } }],
  [/opus-4-[5-7]/, { input: 5, output: 25, readMul: 0.1 }],
  [/opus-4(-1|-\d{8}|$|\[)/, { input: 15, output: 75, readMul: 0.1 }], // Opus 4 / 4.1
  [/sonnet-5-5/, { input: 2, output: 10, readMul: 0.05 }],
  [/sonnet-5(?!-\d)/, { input: 2, output: 10, readMul: 0.1 }],
  [/sonnet-4/, { input: 3, output: 15, readMul: 0.1 }], // 4.6 / 4.5 / 4
  [/haiku-5-5/, { input: 0.1, output: 0.5, readMul: 0.1, longPrompt: { over: 100_000, input: 0.5, output: 2.5 } }],
  [/haiku-4-5/, { input: 1, output: 5, readMul: 0.1 }],
];
// Noma'lum (yangiroq) id — oilaning eng yangi ma'lum narxi.
const FAMILY: [RegExp, Rate][] = [
  [/fable|mythos/, RATES[0][1]],
  [/opus/, RATES[3][1]],
  [/sonnet/, RATES[8][1]],
  [/haiku/, RATES[11][1]],
];
/** Model noma'lum — standart model (Opus 5.5) narxi. */
const DEFAULT_RATE = RATES[3][1];

export function rateFor(model: string | undefined): Rate {
  if (!model) return DEFAULT_RATE;
  const m = model.toLowerCase();
  for (const [re, r] of RATES) if (re.test(m)) return r;
  for (const [re, r] of FAMILY) if (re.test(m)) return r;
  return DEFAULT_RATE;
}

/** Transkriptdagi `message.usage` (Claude Code yozadigan shakl). */
export interface UsageLike {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
  speed?: string;
  inference_geo?: string;
  server_tool_use?: { web_search_requests?: number };
}

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** BITTA API javobining narxi ($). */
export function messageCost(model: string | undefined, u: UsageLike): number {
  const r = rateFor(model);
  const input = n(u.input_tokens);
  const read = n(u.cache_read_input_tokens);
  const writeTotal = n(u.cache_creation_input_tokens);
  const w1h = Math.min(writeTotal, n(u.cache_creation?.ephemeral_1h_input_tokens));
  const w5m = writeTotal - w1h; // bo'linish yo'q bo'lsa — hammasi 5 daqiqalik
  const out = n(u.output_tokens);
  let inRate = r.input;
  let outRate = r.output;
  if (u.speed === "fast" && r.fast) {
    inRate = r.fast.input;
    outRate = r.fast.output;
  } else if (r.longPrompt && input + read + writeTotal > r.longPrompt.over) {
    inRate = r.longPrompt.input;
    outRate = r.longPrompt.output;
  }
  let usd = (input * inRate + w5m * inRate * 1.25 + w1h * inRate * 2 + read * inRate * r.readMul + out * outRate) / 1_000_000;
  if (u.inference_geo === "us") usd *= 1.1;
  usd += n(u.server_tool_use?.web_search_requests) * 0.01;
  return usd;
}
