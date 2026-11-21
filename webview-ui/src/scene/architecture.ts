// ── Arxitektura detallari (S8-4) — ofis rejasidan hosil qilinadi ──
// Sof modul (React/three yo'q) — test qilinadi. Chizish OfficeDecor'da
// (StaticBatch ichida — barcha plintuslar bitta mesh'ga birlashadi).

import { type Rect, ROOMS, roomZ, WALL_VIS_HALF } from "./officeLayout";

export interface BoxSpec {
  /** Markaz (x, y, z). */
  p: [number, number, number];
  /** O'lcham (x, y, z). */
  s: [number, number, number];
}

/** Plintus: har devor to'rtburchagining bino ICHIDAGI har yon yuziga yupqa past
 *  quti (devor yuziga yopishgan). Bino chegarasidagi (tashqi) yuzlar tashlanadi;
 *  eshik teshiklari devor to'rtburchaklarida yo'q — plintus ham u yerda uziladi. */
export function baseboardBoxes(rects: Rect[], clip: Rect, h = 0.09, d = 0.02): BoxSpec[] {
  const out: BoxSpec[] = [];
  const y = h / 2;
  const eps = 1e-6;
  for (const r of rects) {
    // Uzunlik bino ichki chegarasida kesiladi (masalan perimetr devori yon
    // devorlar ichiga kirib ketmasin).
    const x0 = Math.max(r.x0, clip.x0), x1 = Math.min(r.x1, clip.x1);
    const z0 = Math.max(r.z0, clip.z0), z1 = Math.min(r.z1, clip.z1);
    const lx = x1 - x0;
    const lz = z1 - z0;
    // Uzun tomonlar bo'ylab (va qisqa uchlar ham — bo'luvchi uchi, eshik yonbag'ri)
    if (lx > eps && r.z0 > clip.z0 + eps) out.push({ p: [(x0 + x1) / 2, y, r.z0 - d / 2], s: [lx, h, d] });
    if (lx > eps && r.z1 < clip.z1 - eps) out.push({ p: [(x0 + x1) / 2, y, r.z1 + d / 2], s: [lx, h, d] });
    if (lz > eps && r.x0 > clip.x0 + eps) out.push({ p: [r.x0 - d / 2, y, (z0 + z1) / 2], s: [d, h, lz] });
    if (lz > eps && r.x1 < clip.x1 - eps) out.push({ p: [r.x1 + d / 2, y, (z0 + z1) / 2], s: [d, h, lz] });
  }
  return out;
}

/** Eshik ostonasi: har xona eshigi teshigida pol ustida ingichka metall chiziq
 *  (xona poli bilan yo'lak poli tutashgan joy). */
export function thresholdBoxes(h = 0.012): BoxSpec[] {
  return ROOMS.map((r) => {
    const { front } = roomZ(r);
    return { p: [r.doorX, h / 2 + 0.02, front], s: [r.doorW, h, WALL_VIS_HALF * 2] };
  });
}
