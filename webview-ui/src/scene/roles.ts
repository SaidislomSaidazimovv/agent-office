// ── Rol presetlari ───────────────────────────────────────────
// Har rol: yorliq + personaj ranglari. Rol tanlanmaган agentlar seat
// indeksi bo'yicha paletadan rang oladi.

export interface RolePreset {
  key: string;
  label: string;
  colors: { top: string; pants: string; skin: string };
}

export const ROLE_PRESETS: Record<string, RolePreset> = {
  research: { key: "research", label: "Tadqiqot", colors: { top: "#5f6f83", pants: "#2e3440", skin: "#eab894" } },
  frontend: { key: "frontend", label: "Frontend", colors: { top: "#584a86", pants: "#23262e", skin: "#f3c9a8" } },
  backend: { key: "backend", label: "Backend", colors: { top: "#2a2e35", pants: "#383e47", skin: "#c98d55" } },
  qa: { key: "qa", label: "QA / Review", colors: { top: "#a9c4dc", pants: "#39404d", skin: "#f6d7b5" } },
  docs: { key: "docs", label: "Hujjatlar", colors: { top: "#c0913a", pants: "#4b4237", skin: "#e3b078" } },
  data: { key: "data", label: "Ma'lumot", colors: { top: "#e4e7ec", pants: "#30393a", skin: "#a06f42" } },
};

const PALETTE = Object.values(ROLE_PRESETS);

export function presetFor(role: string | undefined, seatIndex: number): RolePreset {
  if (role && ROLE_PRESETS[role]) return ROLE_PRESETS[role];
  return PALETTE[seatIndex % PALETTE.length];
}

// Ish joylari: chap va o'ng ustunlar (3+3), hamma markazga qaraydi.
// (Eski tuned SPOTS qiymatlari — mebel/personaj burchagi shunga mos.)
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
