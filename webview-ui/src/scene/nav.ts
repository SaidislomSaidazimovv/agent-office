// ── Ofis navigatsiyasi (waypoint grafi, katta ofis) ─────────
// Markaziy grid + har xonaning eshik/ich nuqtasi. Agentlar bo'sh turганда
// shular orasида yuradi (eshiklardан xonаларга kiradi).

export interface WP {
  x: number;
  z: number;
}

export const NODES: Record<string, WP> = {};
const EDGES: [string, string][] = [];

// Markaziy grid (ochiq yo'laklar — mebel x=±5.5/±13 dан chetда)
const CX = [-17, -9, 0, 9, 17];
const CZ = [-6.5, 0, 6.5];
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
  NODES[`${key}_d`] = { x: cx, z: doorZ };
  NODES[`${key}_i`] = { x: cx, z: intZ };
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
