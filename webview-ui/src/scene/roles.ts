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

// Ish joylari: chap va o'ng ustunlar (3+3), hamma markazga qaraydi.
export const SEATS: { x: number; z: number; ry: number }[] = [
  { x: -5.5, z: -3.2, ry: -Math.PI / 2 },
  { x: -5.5, z: 0, ry: -Math.PI / 2 },
  { x: -5.5, z: 3.2, ry: -Math.PI / 2 },
  { x: 5.5, z: -3.2, ry: Math.PI / 2 },
  { x: 5.5, z: 0, ry: Math.PI / 2 },
  { x: 5.5, z: 3.2, ry: Math.PI / 2 },
];

export const STATUS_COLOR: Record<string, string> = {
  idle: "#8e8e93",
  thinking: "#5e9bff",
  working: "#30d158",
  review: "#ff9f0a",
  blocked: "#ff453a",
  collab: "#ffd60a",
};

export const STATUS_LABEL: Record<string, string> = {
  idle: "Kutmoqda",
  thinking: "O'ylanmoqda",
  working: "Ishlamoqda",
  review: "Tasdiq kutmoqda",
  blocked: "Bloklangan",
  collab: "Hamkorlikда",
};
