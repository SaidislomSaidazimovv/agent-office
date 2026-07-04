// ── Rol presetlari + Pixel Agents personaj palitralarи ───────
// Pixel Agents 6 personajини (JIK-A-4 Metro City) chuqur o'rganib,
// har birини voxel/blokli chibi 3D personaj sifatida qayta yaratamiz.

export type HairStyle = "short" | "long" | "afro" | "curly" | "medium" | "spiky";

export interface CharSkin {
  label: string;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  top: string;
  bottom: string;
  shoes: string;
}

// 6 pixel personaj → 6 rol. Ranglar sprite'lardан olingan.
export const ROLE_PRESETS: Record<string, CharSkin> = {
  // char_1 — sarg'ish uzun soch, qora libos
  research: { label: "Tadqiqot", skin: "#efc4a2", hair: "#d7a24c", hairStyle: "long", top: "#20222a", bottom: "#26282f", shoes: "#3a2c1e" },
  // char_0 — qisqa jigarrang soch, ko'k/oq ko'ylak, navy shim
  frontend: { label: "Frontend", skin: "#e8b58f", hair: "#6b4a2f", hairStyle: "short", top: "#c3d0e0", bottom: "#2f3a52", shoes: "#20242c" },
  // char_2 — qora afro, to'q teri, to'q-sariq libos
  backend: { label: "Backend", skin: "#6e4a34", hair: "#141414", hairStyle: "afro", top: "#cf5a28", bottom: "#d5722a", shoes: "#eaeaea" },
  // char_5 — qora tikanli soch, qizil ko'ylak
  qa: { label: "QA / Review", skin: "#e8b58f", hair: "#1a1a1a", hairStyle: "spiky", top: "#c0392b", bottom: "#26282f", shoes: "#eaeaea" },
  // char_3 — oq/kumush jingalak soch, oq/krem libos (olim)
  docs: { label: "Hujjatlar", skin: "#d9a884", hair: "#e3e4e6", hairStyle: "curly", top: "#eceae4", bottom: "#c9c4b6", shoes: "#7a5a3a" },
  // char_4 — jigarrang o'rta soch, oq ko'ylak, teal shim
  data: { label: "Ma'lumot", skin: "#e8b58f", hair: "#5a3f28", hairStyle: "medium", top: "#eceae4", bottom: "#2b6b6e", shoes: "#20242c" },
};

const PALETTE = Object.values(ROLE_PRESETS);

export function presetFor(role: string | undefined, seatIndex: number): CharSkin {
  if (role && ROLE_PRESETS[role]) return ROLE_PRESETS[role];
  return PALETTE[seatIndex % PALETTE.length];
}

export interface Seat { x: number; z: number; ry: number }

// Ish joylari — hamma markazga qaraydi.
//  • 1-6: asosiy ikki ustun (chap/o'ng, x=±5.5).
//  • 7-10: markazдаги qo'shimcha stollar (x=±13) — ofis to'ladi (Variant B).
export const SEATS: Seat[] = [
  { x: -5.5, z: -3.2, ry: -Math.PI / 2 },
  { x: -5.5, z: 0, ry: -Math.PI / 2 },
  { x: -5.5, z: 3.2, ry: -Math.PI / 2 },
  { x: 5.5, z: -3.2, ry: Math.PI / 2 },
  { x: 5.5, z: 0, ry: Math.PI / 2 },
  { x: 5.5, z: 3.2, ry: Math.PI / 2 },
  // Qo'shimcha stollar (avval "bo'sh stol" edi — endi overflow agentlar shu yerда)
  { x: -13, z: -3, ry: -Math.PI / 2 },
  { x: -13, z: 3, ry: -Math.PI / 2 },
  { x: 13, z: -3, ry: Math.PI / 2 },
  { x: 13, z: 3, ry: Math.PI / 2 },
];

/** O'rindiq soni — dinamik (SEATS uzunligidan). */
export const SEAT_COUNT = SEATS.length;

/** Indeks bo'yicha o'rindiq. SEATS'dan tashqari (juda ko'p agent) — ustma-ust
 *  bo'lmasin uchun markazий ochiq maydonда neat qator generatsiya qilinadi. */
export function seatFor(index: number): Seat {
  if (index >= 0 && index < SEATS.length) return SEATS[index];
  const o = index - SEATS.length;
  const cols = 5;
  const col = o % cols;
  const row = Math.floor(o / cols);
  return { x: -4.4 + col * 2.2, z: -5.2 - row * 2.0, ry: Math.PI };
}

/** Personaj o'tirish nuqtasi (stul markazi, yo'nalishга mos) — Workstation
 *  stuli bilan bir xil formula: (0.72·sin(ry), 0.72·cos(ry)) siljish. */
export function sitPoint(seat: Seat): { x: number; z: number } {
  return { x: seat.x + 0.72 * Math.sin(seat.ry), z: seat.z + 0.72 * Math.cos(seat.ry) };
}

export const STATUS_COLOR: Record<string, string> = {
  idle: "#8e8e93",
  thinking: "#5e9bff",
  working: "#30d158",
  review: "#ff9f0a",
  blocked: "#ff453a",
  collab: "#ffd60a",
};

// Standart kontekst oynasi (model aniqlanmasa — token health-bar uchun).
export const MAX_CONTEXT_TOKENS = 200000;

export function tokenBar(input: number, contextWindow: number = MAX_CONTEXT_TOKENS): { pct: number; color: string } {
  const win = contextWindow > 0 ? contextWindow : MAX_CONTEXT_TOKENS;
  const pct = Math.min(1, input / win);
  const color = pct < 0.6 ? "#30d158" : pct < 0.8 ? "#ffd60a" : pct < 0.95 ? "#ff9f0a" : "#ff453a";
  return { pct, color };
}

export const STATUS_LABEL: Record<string, string> = {
  idle: "Kutmoqda",
  thinking: "O'ylanmoqda",
  working: "Ishlamoqda",
  review: "Tasdiq kutmoqda",
  blocked: "Bloklangan",
  collab: "Hamkorlikда",
};
