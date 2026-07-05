// ── Ofis navigatsiyasi (waypoint grafi, katta ofis) ─────────
// Markaziy grid + har xonaning eshik/ich nuqtasi. Agentlar bo'sh turganda
// shular orasida yuradi (eshiklardan xonalarga kiradi).

import { blocked } from "./collision";

export interface WP {
  x: number;
  z: number;
}

export const NODES: Record<string, WP> = {};
const EDGES: [string, string][] = [];

// Markaziy grid (ochiq yo'laklar — agent stollari x=±5.5, z=-3.2/0/3.2 va
// yon stollar x=±13 dan chetda: qatorlar ular orasidagi yo'laklarda).
const CX = [-17, -9, 0, 9, 17];
const CZ = [-6.5, -1.8, 1.8, 6.5];
const grid: string[][] = [];
CX.forEach((x, i) => {
  grid[i] = [];
  CZ.forEach((z, j) => {
    const k = `g${i}_${j}`;
    NODES[k] = { x, z };
    grid[i][j] = k;
  });
});
for (let i = 0; i < CX.length; i++) {
  for (let j = 0; j < CZ.length; j++) {
    if (i + 1 < CX.length) EDGES.push([grid[i][j], grid[i + 1][j]]);
    if (j + 1 < CZ.length) EDGES.push([grid[i][j], grid[i][j + 1]]);
  }
}

// Xonalar: [kalit, markaz-x, tomon]
const ROOMS: [string, number, "top" | "bottom"][] = [
  ["server", -16, "top"], ["kitchen", -5, "top"], ["meeting", 3.5, "top"], ["bathroom", 11.5, "top"], ["glassA", 19, "top"],
  ["library", -17, "bottom"], ["focus", -7, "bottom"], ["lounge", 2, "bottom"], ["glassB", 11, "bottom"], ["glassC", 19, "bottom"],
];
for (const [key, cx, side] of ROOMS) {
  const doorZ = side === "top" ? -9.0 : 9.0;
  const intZ = side === "top" ? -12.5 : 12.5;
  // Ichki nuqta mebel to'siqiga tushsa — eshik tomon surib chiqaramiz (agent
  // stolga tiqilib titramasin). O'z-o'zini to'g'rilaydi: mebel o'zgarsa ham.
  const step = side === "top" ? 0.5 : -0.5;
  let iz = intZ;
  for (let g = 0; g < 12 && blocked(cx, iz, 0.3); g++) iz += step;
  NODES[`${key}_d`] = { x: cx, z: doorZ };
  NODES[`${key}_i`] = { x: cx, z: iz };
  EDGES.push([`${key}_d`, `${key}_i`]);
  let best = "";
  let bd = Infinity;
  for (const gk of Object.keys(NODES)) {
    if (!gk.startsWith("g")) continue;
    const n = NODES[gk];
    const d = (n.x - cx) ** 2 + (n.z - doorZ) ** 2;
    if (d < bd) {
      bd = d;
      best = gk;
    }
  }
  EDGES.push([`${key}_d`, best]);
}

const ADJ: Record<string, string[]> = {};
for (const k of Object.keys(NODES)) ADJ[k] = [];
for (const [a, b] of EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}
const KEYS = Object.keys(NODES);

export function nearestNode(x: number, z: number): string {
  let best = KEYS[0];
  let bd = Infinity;
  for (const k of KEYS) {
    const n = NODES[k];
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}

export function pathBetween(from: string, to: string): WP[] {
  if (from === to) return [NODES[to]];
  const prev: Record<string, string | null> = { [from]: null };
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    if (cur === to) break;
    for (const n of ADJ[cur]) {
      if (!(n in prev)) {
        prev[n] = cur;
        q.push(n);
      }
    }
  }
  if (!(to in prev)) return [NODES[to]];
  const out: WP[] = [];
  let c: string | null = to;
  while (c) {
    out.unshift(NODES[c]);
    c = prev[c];
  }
  return out;
}

export function randomNodeKey(): string {
  return KEYS[Math.floor(Math.random() * KEYS.length)];
}

// ── Kontekstli (smart) idle manzillari ──────────────────────
// Bo'sh turgan agent tasodifiy nuqtaga emas — rolига mos xonaga boradi
// (tadqiqotchi kutubxonaga, backend serverga, hamma oshxonaga tanaffusga...).
// Bu ofisni "tirik" ko'rsatadi: har kim maqsad bilan yuradi.

const ROLE_ROOMS: Record<string, string[]> = {
  research: ["library_i", "focus_i", "kitchen_i"],
  docs: ["library_i", "focus_i", "lounge_i"],
  frontend: ["kitchen_i", "lounge_i", "meeting_i"],
  backend: ["server_i", "kitchen_i", "lounge_i"],
  data: ["focus_i", "library_i", "kitchen_i"],
  qa: ["meeting_i", "lounge_i", "kitchen_i"],
};

// Ishdan keyingi birinchi "tanaffus" xonalari (oshxona/lounge).
const BREAK_ROOMS = ["kitchen_i", "lounge_i"];

// Barcha xona ichki nuqtalari (rol noma'lum bo'lsa — istalgan xona).
const ALL_ROOMS = ROOMS.map(([k]) => `${k}_i`);

/** Ishni tugatgach birinchi idle safar — tanaffusga (oshxona/lounge). */
export function breakRoom(): string {
  return BREAK_ROOMS[Math.floor(Math.random() * BREAK_ROOMS.length)];
}

/** Rolига mos idle manzil. 25% holatda umumiy tasodif — tabiiy ko'rinsin. */
export function idleDestination(role: string | undefined): string {
  if (Math.random() < 0.25) return randomNodeKey();
  const rooms = (role && ROLE_ROOMS[role]) || ALL_ROOMS;
  return rooms[Math.floor(Math.random() * rooms.length)];
}
