// ── Ofis navigatsiyasi (waypoint grafi) — ofis rejasidan AVTOMATIK ──
// Ochiq ish maydonida muntazam to'r (LATTICE) + har xonaning eshik/ich nuqtasi.
// To'r tugunlari va qirralari to'siqlardan (devor, doimiy mebel, 10 ta doimiy
// stol + stuli — officeLayout.ts) avtomatik tozalanadi: bino yoki mebel
// o'zgarsa graf o'zi moslashadi (avval markaziy grid qo'lda tanlangan edi).
// Agentlar bo'sh turganda shular orasida yuradi (eshiklardan xonalarga kiradi).

import { BUILDING, furnitureRects, type Rect, ROOM_LINE, ROOMS, type Seat, SEATS, wallRects } from "./officeLayout";

export interface WP {
  x: number;
  z: number;
}

export const NODES: Record<string, WP> = {};
/** Graf qirralari — sinov (nav-validatsiya) uchun ham eksport qilinadi. */
export const EDGES: [string, string][] = [];

/** To'r qadami (m). */
const LATTICE = 2;
/** Tugun atrofida bo'sh joy (m) — agent tugunda turganda hech narsaga tegmasin. */
const NODE_CLEAR = 0.32;
/** Qirra/tekislash tekshiruvi radiusi — agent radiusidan (0.16) kengroq zaxira. */
const PATH_CLEAR = 0.22;

/** O'rindiq (stol + stul) egallagan joy — stol 1.5×0.8, stul orqasida (lokal
 *  z ≤ 1.0). Aylantirilgan to'rtburchakning AABB'si. */
function seatFootprint(s: Seat): Rect {
  const c = Math.cos(s.ry), sn = Math.sin(s.ry);
  const xs: number[] = [], zs: number[] = [];
  for (const lx of [-0.8, 0.8]) for (const lz of [-0.45, 1.0]) {
    xs.push(s.x + lx * c + lz * sn);
    zs.push(s.z - lx * sn + lz * c);
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

/** Graf qurishdagi statik to'siqlar: devorlar, doimiy mebel, doimiy stollar.
 *  (Overflow stollar va foydalanuvchi mebeli dinamik — ularni yurish paytidagi
 *  to'qnashuv (collision.slide) hal qiladi.) */
const STATIC: Rect[] = [...wallRects(), ...furnitureRects(), ...SEATS.map(seatFootprint)];
/** Stulsiz variant — o'tirgan agent (stulda) uchun "qaysi tugun ko'rinadi"
 *  tekshiruvi (aks holda o'tirish nuqtasining o'zi to'siq ichida bo'lardi).
 *  Stol o'lchami collision.ts dagi band stol to'sig'i bilan bir xil. */
const STATIC_NO_CHAIRS: Rect[] = [...wallRects(), ...furnitureRects(), ...SEATS.map((s) => {
  const hx = Math.abs(0.75 * Math.cos(s.ry)) + Math.abs(0.4 * Math.sin(s.ry)) + 0.05;
  const hz = Math.abs(0.75 * Math.sin(s.ry)) + Math.abs(0.4 * Math.cos(s.ry)) + 0.05;
  return { x0: s.x - hx, x1: s.x + hx, z0: s.z - hz, z1: s.z + hz };
})];
function hit(x: number, z: number, rad: number, rects: Rect[] = STATIC): boolean {
  for (const b of rects) if (x > b.x0 - rad && x < b.x1 + rad && z > b.z0 - rad && z < b.z1 + rad) return true;
  return false;
}
/** Ikki nuqta orasidagi to'g'ri kesma statik to'siqlarga tegmaydimi? */
function clearPath(ax: number, az: number, bx: number, bz: number, rad = PATH_CLEAR, rects: Rect[] = STATIC): boolean {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(2, Math.ceil(d / 0.1));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (hit(ax + (bx - ax) * t, az + (bz - az) * t, rad, rects)) return false;
  }
  return true;
}

// ── Ochiq maydon to'ri ──
// x: bino chetidan 1 m ichkarida; z: xona devorlaridan 1 m ichkarida.
const gx: number[] = [];
for (let x = -BUILDING.W / 2 + 1; x <= BUILDING.W / 2 - 1 + 1e-9; x += LATTICE) gx.push(+x.toFixed(3));
const gz: number[] = [];
for (let z = -ROOM_LINE + 1; z <= ROOM_LINE - 1 + 1e-9; z += LATTICE) gz.push(+z.toFixed(3));
/** Faqat ochiq maydon to'ri tugunlari. (DIQQAT: "glassA_d" ham "g" bilan
 *  boshlanadi — startsWith("g") ISHLATMAYMIZ, aniq ro'yxat yuritamiz.) */
const GRID_KEYS: string[] = [];
gx.forEach((x, i) => gz.forEach((z, j) => {
  if (hit(x, z, NODE_CLEAR)) return;
  const k = `g${i}_${j}`;
  NODES[k] = { x, z };
  GRID_KEYS.push(k);
}));
// 8 qo'shni (diagonal ham) — faqat kesma to'siqsiz bo'lsa.
for (let i = 0; i < gx.length; i++) {
  for (let j = 0; j < gz.length; j++) {
    const a = `g${i}_${j}`;
    if (!NODES[a]) continue;
    for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const b = `g${i + di}_${j + dj}`;
      if (!NODES[b]) continue;
      if (clearPath(NODES[a].x, NODES[a].z, NODES[b].x, NODES[b].z)) EDGES.push([a, b]);
    }
  }
}

// ── Xonalar (ofis rejasidan): eshik tuguni + ichki tugun ──
for (const { key, doorX: cx, side } of ROOMS) {
  // Eshik tuguni — devor chizig'idan 0.5 ochiq maydon tomonda.
  const doorZ = side === "top" ? -(ROOM_LINE - 0.5) : ROOM_LINE - 0.5;
  const inward = side === "top" ? -1 : 1;
  // Ichki tugun: eshikdan ichkariga YURIB, birinchi to'siqgacha eng chuqur bo'sh
  // nuqta. Shunda door→interior kesmasi HAR DOIM to'siqsiz — agent xonaga kirib
  // qolmaydi va bemalol chiqadi.
  let iz = doorZ;
  for (let z = doorZ; Math.abs(z - doorZ) <= 6.5; z += inward * 0.25) {
    if (hit(cx, z, NODE_CLEAR)) break;
    iz = z;
  }
  NODES[`${key}_d`] = { x: cx, z: doorZ };
  NODES[`${key}_i`] = { x: cx, z: iz };
  EDGES.push([`${key}_d`, `${key}_i`]);
  // Eshikni eng yaqin TO'SIQSIZ to'r tugunlariga (2 tagacha) ulaymiz — masofa
  // emas, haqiqiy yo'l muhim (masalan lounge eshigi resepshn stoli ortida qolmasin).
  const near = [...GRID_KEYS].sort((a, b) => {
    const A = NODES[a], B = NODES[b];
    return (A.x - cx) ** 2 + (A.z - doorZ) ** 2 - ((B.x - cx) ** 2 + (B.z - doorZ) ** 2);
  });
  const ok = near.filter((gk) => clearPath(cx, doorZ, NODES[gk].x, NODES[gk].z)).slice(0, 2);
  for (const gk of ok.length ? ok : [near[0]]) EDGES.push([`${key}_d`, gk]);
}

const ADJ: Record<string, string[]> = {};
for (const k of Object.keys(NODES)) ADJ[k] = [];
for (const [a, b] of EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}
const KEYS = Object.keys(NODES);

/** Eng yaqin tugun — iloji bo'lsa to'g'ri chiziqda (devor/mebel ortida emas)
 *  yetib boriladigani. Hech biri ko'rinmasa — shunchaki eng yaqini. */
export function nearestNode(x: number, z: number): string {
  const byDist = KEYS.map((k) => [k, (NODES[k].x - x) ** 2 + (NODES[k].z - z) ** 2] as const).sort((a, b) => a[1] - b[1]);
  for (let i = 0; i < Math.min(8, byDist.length); i++) {
    const n = NODES[byDist[i][0]];
    // 0.18 — agent radiusi (0.16) + zaxira; stullar to'siq emas (agent stuldan turadi).
    if (clearPath(x, z, n.x, n.z, 0.18, STATIC_NO_CHAIRS)) return byDist[i][0];
  }
  return byDist[0][0];
}

/** Eng qisqa yo'l (Dijkstra, haqiqiy masofa) + tekislash: ko'rinib turgan
 *  oraliq nuqtalar tashlab yuboriladi (agent zinapoyadek emas, to'g'ri yuradi).
 *  Yetib bo'lmasa — BO'SH yo'l (agent devorga qarab yurib tiqilmasin). */
export function pathBetween(from: string, to: string): WP[] {
  if (!NODES[from] || !NODES[to]) return [];
  if (from === to) return [NODES[to]];
  const dist: Record<string, number> = { [from]: 0 };
  const prev: Record<string, string | null> = { [from]: null };
  const open = new Set([from]);
  const done = new Set<string>();
  while (open.size) {
    let cur = "";
    let cd = Infinity;
    for (const k of open) if (dist[k] < cd) { cd = dist[k]; cur = k; }
    open.delete(cur);
    if (cur === to) break;
    done.add(cur);
    const C = NODES[cur];
    for (const n of ADJ[cur]) {
      if (done.has(n)) continue;
      const nd = cd + Math.hypot(NODES[n].x - C.x, NODES[n].z - C.z);
      if (nd < (dist[n] ?? Infinity)) { dist[n] = nd; prev[n] = cur; open.add(n); }
    }
  }
  if (!(to in prev)) return [];
  const raw: WP[] = [];
  let c: string | null = to;
  while (c) {
    raw.unshift(NODES[c]);
    c = prev[c];
  }
  // Tekislash (string pulling): joriy nuqtadan ko'rinadigan eng uzoq nuqtaga sakraymiz.
  const out: WP[] = [raw[0]];
  let i = 0;
  while (i < raw.length - 1) {
    let j = raw.length - 1;
    while (j > i + 1 && !clearPath(raw[i].x, raw[i].z, raw[j].x, raw[j].z)) j--;
    out.push(raw[j]);
    i = j;
  }
  return out;
}

export function randomNodeKey(): string {
  return KEYS[Math.floor(Math.random() * KEYS.length)];
}

// ── Kontekstli (smart) idle manzillari ──────────────────────
// Bo'sh turgan agent tasodifiy nuqtaga emas — roliga mos xonaga boradi
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
const ALL_ROOMS = ROOMS.map((r) => `${r.key}_i`);

/** Ishni tugatgach birinchi idle safar — tanaffusga (oshxona/lounge). */
export function breakRoom(): string {
  return BREAK_ROOMS[Math.floor(Math.random() * BREAK_ROOMS.length)];
}

/** Roliga mos idle manzil. 25% holatda umumiy tasodif — tabiiy ko'rinsin. */
export function idleDestination(role: string | undefined): string {
  if (Math.random() < 0.25) return randomNodeKey();
  const rooms = (role && ROLE_ROOMS[role]) || ALL_ROOMS;
  return rooms[Math.floor(Math.random() * rooms.length)];
}
