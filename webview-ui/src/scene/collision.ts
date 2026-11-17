import { furnitureRects, type Rect, wallRects } from "./officeLayout";
import { seatFor } from "./roles";

// ── To'qnashuv (AABB to'siqlar) ──────────────────────────────
// Devor/oyna/mebel — to'rtburchak to'siqlar. Kamera ham personaj ham
// bularga uriladi (arvohdek o'tmaydi). Tez: ~120 to'rtburchak, sof math.

export type { Rect };

const B: Rect[] = [];
// ── Devorlar: perimetr, xona old devorlari (eshik teshigi bilan), bo'luvchilar ──
// Ofis rejasidan hosil qilinadi (officeLayout.ts — yagona manba).
B.push(...wallRects());

// ── Agent stollari — DINAMIK (faqat band o'rindiqlar) ──
// Stol collision'i faqat renderlangan (band) stollar uchun bo'ladi. Aks holda
// bo'sh overflow o'rindiqlari markaziy yo'lakda "fantom devor" hosil qilardi.
// Stol 1.5×0.8; to'siq stol yo'nalishiga (ry) qarab aylanadi.
// Foydalanuvchi joylashtirgan mebel to'siqlari (Layout editor) — dinamik.
let placedRects: Rect[] = [];
export function setPlacedRects(rects: Rect[]): void {
  placedRects = rects;
}

let seatRects: Rect[] = [];
export function setActiveSeats(seatIndexes: number[]): void {
  seatRects = seatIndexes.map((i) => {
    const s = seatFor(i);
    const hx = Math.abs(0.75 * Math.cos(s.ry)) + Math.abs(0.4 * Math.sin(s.ry)) + 0.05;
    const hz = Math.abs(0.75 * Math.sin(s.ry)) + Math.abs(0.4 * Math.cos(s.ry)) + 0.05;
    return { x0: s.x - hx, x1: s.x + hx, z0: s.z - hz, z1: s.z + hz };
  });
}

// ── Statik mebel — ofis rejasidan (officeLayout.ts) ──
B.push(...furnitureRects());

/** (x,z) nuqta radius r bilan biror to'siqga tegadimi? (statik mebel + band stollar) */
export function blocked(x: number, z: number, rad: number): boolean {
  for (const b of B) {
    if (x > b.x0 - rad && x < b.x1 + rad && z > b.z0 - rad && z < b.z1 + rad) return true;
  }
  for (const b of seatRects) {
    if (x > b.x0 - rad && x < b.x1 + rad && z > b.z0 - rad && z < b.z1 + rad) return true;
  }
  for (const b of placedRects) {
    if (x > b.x0 - rad && x < b.x1 + rad && z > b.z0 - rad && z < b.z1 + rad) return true;
  }
  return false;
}

/** Harakatni o'qlar bo'yicha alohida qo'llaydi (devor bo'ylab sirg'anadi).
 *  QOCHISH: agar personaj ALLAQACHON to'siq ichida bo'lsa (masalan ustiga
 *  dinamik o'rindiq/mebel to'siqi paydo bo'lgan), har yo'nalish bloklanib
 *  abadiy tiqilib qolardi — shu holda harakatga ruxsat beramiz (chiqib ketsin). */
export function slide(x: number, z: number, dx: number, dz: number, rad: number): { x: number; z: number } {
  if (blocked(x, z, rad)) return { x: x + dx, z: z + dz };
  let nx = x;
  let nz = z;
  if (dx !== 0 && !blocked(x + dx, z, rad)) nx = x + dx;
  if (dz !== 0 && !blocked(nx, z + dz, rad)) nz = z + dz;
  return { x: nx, z: nz };
}
