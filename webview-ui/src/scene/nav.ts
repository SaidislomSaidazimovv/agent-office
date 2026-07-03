// ── Ofis navigatsiyasi (waypoint grafi) ──────────────────────
// Agentlar bo'sh turганда shu nuqtalar orasида yuradi (eshiklar orqali
// xonaларга kiradi). Sodda BFS — devorларга tegmaydi, chunki yo'llar
// ochiq joylardан va eshiklardан o'tadi.

export interface WP {
  x: number;
  z: number;
}

// Nuqtalar (dunyo koordinatalari, ofis x[-16,16] z[-13,13])
export const NODES: Record<string, WP> = {
  c0: { x: 0, z: 0 },
  c1: { x: -6, z: -4 },
  c2: { x: 0, z: -5 },
  c3: { x: 6, z: -4 },
  c4: { x: 7, z: 0 },
  c5: { x: 6, z: 4 },
  c6: { x: 0, z: 5.5 },
  c7: { x: -6, z: 4 },
  c8: { x: -7, z: 0 },
  // Oshxona
  kd: { x: -12, z: -6.2 },
  ki: { x: -12, z: -10 },
  // Majlis
  md: { x: 12, z: -6.2 },
  mi: { x: 12, z: -10.5 },
  // Fokus-xona
  fd: { x: -12.5, z: 6.2 },
  fi: { x: -12.5, z: 10.5 },
  // Dam olish
  ld: { x: 12, z: 6.2 },
  li: { x: 12, z: 10.5 },
};

const EDGES: [string, string][] = [
  // Markaziy halqa (ochiq — bir-biriga bog'liq)
  ["c0", "c1"], ["c0", "c2"], ["c0", "c3"], ["c0", "c4"], ["c0", "c5"], ["c0", "c6"], ["c0", "c7"], ["c0", "c8"],
  ["c1", "c2"], ["c2", "c3"], ["c3", "c4"], ["c4", "c5"], ["c5", "c6"], ["c6", "c7"], ["c7", "c8"], ["c8", "c1"],
  // Xonalar (eshik orqali)
  ["c1", "kd"], ["kd", "ki"],
  ["c3", "md"], ["md", "mi"],
  ["c7", "fd"], ["fd", "fi"],
  ["c5", "ld"], ["ld", "li"],
];

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

/** BFS — from → to node kalitlari orasidа nuqtalar ro'yxati. */
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

/** Tasodifiy sayr nuqtasi (ba'zан xonaга kiradi). */
export function randomNodeKey(): string {
  return KEYS[Math.floor(Math.random() * KEYS.length)];
}
