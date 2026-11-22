// ── Saqlangan layout'ni yangi ofis rejasiga moslash (S8-5) ───
// Foydalanuvchi joylashtirgan mebel (~/.agent-office/layout.json) eski rejada
// bo'sh bo'lgan joyda turgan bo'lishi mumkin — S8-5 da u yerga stol klasterlari
// va jihozlar qo'yildi. Yuklashda shunday buyum statik dunyoga (devor, doimiy
// mebel, stol+stul) sezilarli kirib qolgan bo'lsa, eng yaqin bo'sh joyga
// suriladi. To'qnashmagan buyumlar AYNAN joyida qoladi; foydalanuvchining o'z
// buyumlari bir-biriga yaqin turishi (uning niyati) tekshirilmaydi.
// Faylga avtomatik yozilmaydi: tuzatish xotirada, har yuklashda bir xil
// (deterministik); fayl foydalanuvchi keyingi marta biror narsani o'zgartirganda
// saqlanadi. Sof modul — test qilinadi.

import { BUILDING, furnitureRects, PERIM_VIS_HALF, type Rect, type Seat, SEATS, WALL_VIS_HALF, wallRects } from "./officeLayout";

export interface MovableItem {
  id: string;
  type: string;
  x: number;
  z: number;
  ry: number;
}

/** Shu chuqurlikdan (m) kam kirib qolish to'qnashuv hisoblanmaydi — devorga
 *  taqab qo'yilgan buyum keraksiz siljimasin. */
const TOLERANCE = 0.05;
/** Muharrir to'ri (layoutStore GRID bilan bir xil). */
const STEP = 0.5;
/** Eng uzoq qidiruv radiusi (m). */
const MAX_R = 6;

function seatRect(s: Seat): Rect {
  // Stol + stul (nav.ts seatFootprint bilan bir xil o'lcham)
  const c = Math.cos(s.ry), sn = Math.sin(s.ry);
  const xs: number[] = [], zs: number[] = [];
  for (const lx of [-0.8, 0.8]) for (const lz of [-0.45, 1.0]) {
    xs.push(s.x + lx * c + lz * sn);
    zs.push(s.z - lx * sn + lz * c);
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

/** Statik dunyo to'siqlari (chizilgan devor qalinligi bilan). */
export function staticObstacles(): Rect[] {
  return [...wallRects(WALL_VIS_HALF, PERIM_VIS_HALF), ...furnitureRects(), ...SEATS.map(seatRect)];
}

const INTERIOR: Rect = {
  x0: -BUILDING.W / 2 + PERIM_VIS_HALF,
  x1: BUILDING.W / 2 - PERIM_VIS_HALF,
  z0: -BUILDING.D / 2 + PERIM_VIS_HALF,
  z1: BUILDING.D / 2 - PERIM_VIS_HALF,
};

function collides(x: number, z: number, hx: number, hz: number, obs: Rect[]): boolean {
  for (const o of obs) {
    const dx = Math.min(x + hx, o.x1) - Math.max(x - hx, o.x0);
    const dz = Math.min(z + hz, o.z1) - Math.max(z - hz, o.z0);
    if (dx > TOLERANCE && dz > TOLERANCE) return true;
  }
  return false;
}
function inside(x: number, z: number, hx: number, hz: number): boolean {
  return x - hx >= INTERIOR.x0 - TOLERANCE && x + hx <= INTERIOR.x1 + TOLERANCE && z - hz >= INTERIOR.z0 - TOLERANCE && z + hz <= INTERIOR.z1 + TOLERANCE;
}

/** To'qnashgan buyumlarni eng yaqin bo'sh joyga suradi. `foot` — buyum oyoq izi
 *  (furniture.ts footprint). Qaytadi: yangi ro'yxat (o'zgarmaganlari AYNAN o'sha
 *  obyekt) va surilganlar soni. */
export function resolvePlacements<T extends MovableItem>(
  items: T[],
  foot: (type: string, ry: number) => { hx: number; hz: number },
  obstacles: Rect[] = staticObstacles(),
): { items: T[]; moved: number } {
  let moved = 0;
  const out = items.map((it) => {
    if (!Number.isFinite(it.x) || !Number.isFinite(it.z)) return it;
    // Saqlangan faylda ry bo'lmasligi/son bo'lmasligi mumkin (host tekshirmaydi)
    const { hx, hz } = foot(it.type, Number.isFinite(it.ry) ? it.ry : 0);
    if (inside(it.x, it.z, hx, hz) && !collides(it.x, it.z, hx, hz, obstacles)) return it;
    // To'r halqalari bo'yicha qidiruv. Buyum to'r nuqtasida bo'lmasa keyingi
    // halqadagi nomzod yaqinroq bo'lishi mumkin — shuning uchun birinchi bo'sh
    // nomzod topilgan halqa VA undan keyingisi birga solishtiriladi; tenglikda
    // (x, z) tartibi (deterministik).
    const bx = Math.round(it.x / STEP) * STEP;
    const bz = Math.round(it.z / STEP) * STEP;
    const ringFree = (ring: number) => {
      const free: { x: number; z: number; d: number }[] = [];
      for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        const x = bx + i * STEP, z = bz + j * STEP;
        if (inside(x, z, hx, hz) && !collides(x, z, hx, hz, obstacles)) free.push({ x, z, d: Math.hypot(x - it.x, z - it.z) });
      }
      return free;
    };
    const maxRing = Math.floor(MAX_R / STEP);
    for (let ring = 0; ring <= maxRing; ring++) {
      const free = ringFree(ring);
      if (!free.length) continue;
      if (ring + 1 <= maxRing) free.push(...ringFree(ring + 1));
      free.sort((a, b) => a.d - b.d || a.x - b.x || a.z - b.z);
      moved++;
      return { ...it, x: free[0].x, z: free[0].z };
    }
    return it; // bo'sh joy topilmadi — joyida qoladi
  });
  return { items: out, moved };
}
