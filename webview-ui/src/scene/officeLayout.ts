// ── Ofis rejasi — YAGONA manba (S8-2) ────────────────────────
// Bino o'lchami, xonalar (devor, eshik, pol zonasi), o'rindiqlar va FPV
// chegarasi shu yerda. Ilgari bu raqamlar 5 joyda qo'lda takrorlangan edi
// (OfficeDecor, collision, nav, roles, FirstPersonView) — bino o'zgarsa
// hammasini birdek o'zgartirish kerak edi. Endi chizish, to'qnashuv, navigatsiya
// va FPV chegarasi shu ma'lumotdan HOSIL qilinadi.
// Sof modul (React/three yo'q) — test qilinadi.

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Bino: kenglik (x), chuqurlik (z), devor balandligi. */
export const BUILDING = { W: 46, D: 32, WH: 3.4 } as const;

/** Xonalar qatori chizig'i: yuqori xonalar z ∈ [−D/2, −ROOM_LINE], pastkilar
 *  z ∈ [ROOM_LINE, D/2]; o'rtasi — ochiq ish maydoni. */
export const ROOM_LINE = 9.5;
/** Ichki devor/bo'luvchi yarim qalinligi (to'qnashuv uchun). */
export const WALL_HALF = 0.16;
/** Perimetr devor yarim qalinligi (to'qnashuv uchun). */
export const PERIM_HALF = 0.2;

/** Xona pol rangi (district identikasi — 0.1.5 palitrasi). */
export const DISTRICT = {
  server: "#252a31", // ma'lumot g'ori — deyarli qora (yagona dramatik langar)
  kitchen: "#7fbcae", // retro diner — moviy-yashil
  meeting: "#41536b", // boardroom — jiddiy shifer-ko'k
  bathroom: "#c3dde3", // toza kafel — och akva
  library: "#6d4c30", // sobor — to'q yong'oq yog'och
  focus: "#8aa88c", // sokin zona — sage yashil
  lounge: "#b87a52", // uy — terakota
  glass: "#dde1e8", // shisha xonalar — salqin och (yengillik = ularning identikasi)
} as const;
export type District = keyof typeof DISTRICT;

/** Pol yuzasi turi (protsedural tekstura — textures.ts). */
export type FloorKind = "carpet" | "wood" | "tile" | "concrete";

export interface RoomDef {
  /** Barqaror kalit (nav tugunlari: `${key}_d`, `${key}_i`). */
  key: string;
  side: "top" | "bottom";
  x0: number;
  x1: number;
  /** Eshik markazi (x) va kengligi. */
  doorX: number;
  doorW: number;
  floor: District;
  /** Pol yuzasi (naqsh) va uning masshtabi (1 = standart o'lcham). */
  surface: FloorKind;
  surfaceScale?: number;
  /** Shisha old devor (aks holda qattiq devor + eshik tavaqasi). */
  glass: boolean;
}

export const ROOMS: RoomDef[] = [
  // Yuqori qator (z ∈ [−16, −9.5])
  { key: "server", side: "top", x0: -23, x1: -9, doorX: -16, doorW: 2.6, floor: "server", surface: "tile", surfaceScale: 2, glass: false },
  { key: "kitchen", side: "top", x0: -9, x1: -1, doorX: -5, doorW: 2, floor: "kitchen", surface: "tile", glass: false },
  { key: "meeting", side: "top", x0: -1, x1: 8, doorX: 3.5, doorW: 2, floor: "meeting", surface: "carpet", glass: false },
  { key: "bathroom", side: "top", x0: 8, x1: 15, doorX: 11.5, doorW: 2, floor: "bathroom", surface: "tile", glass: false },
  { key: "glassA", side: "top", x0: 15, x1: 23, doorX: 19, doorW: 2, floor: "glass", surface: "carpet", glass: true },
  // Pastki qator (z ∈ [9.5, 16])
  { key: "library", side: "bottom", x0: -23, x1: -11, doorX: -17, doorW: 2.4, floor: "library", surface: "wood", glass: false },
  { key: "focus", side: "bottom", x0: -11, x1: -3, doorX: -7, doorW: 2, floor: "focus", surface: "carpet", glass: false },
  { key: "lounge", side: "bottom", x0: -3, x1: 7, doorX: 2, doorW: 2, floor: "lounge", surface: "wood", glass: false },
  { key: "glassB", side: "bottom", x0: 7, x1: 15, doorX: 11, doorW: 2, floor: "glass", surface: "carpet", glass: true },
  { key: "glassC", side: "bottom", x0: 15, x1: 23, doorX: 19, doorW: 2, floor: "glass", surface: "carpet", glass: true },
];

/** Xonaning z oralig'i (devor chizig'idan bino chetigacha). */
export function roomZ(r: RoomDef): { z0: number; z1: number; front: number } {
  const half = BUILDING.D / 2;
  return r.side === "top" ? { z0: -half, z1: -ROOM_LINE, front: -ROOM_LINE } : { z0: ROOM_LINE, z1: half, front: ROOM_LINE };
}

/** Bir qatordagi qo'shni xonalar orasidagi bo'luvchilar (x koordinatalari). */
export function dividerXs(side: "top" | "bottom"): number[] {
  const row = ROOMS.filter((r) => r.side === side).sort((a, b) => a.x0 - b.x0);
  return row.slice(0, -1).map((r) => r.x1);
}

/** Devor/eshik to'siqlari: perimetr, xona old devorlari (eshik teshigi bilan)
 *  va xonalar orasidagi bo'luvchilar. */
export function wallRects(): Rect[] {
  const W2 = BUILDING.W / 2;
  const D2 = BUILDING.D / 2;
  const P = PERIM_HALF;
  const T = WALL_HALF;
  const out: Rect[] = [
    { x0: -W2, x1: W2, z0: -D2 - P, z1: -D2 + P },
    { x0: -W2, x1: W2, z0: D2 - P, z1: D2 + P },
    { x0: -W2 - P, x1: -W2 + P, z0: -D2, z1: D2 },
    { x0: W2 - P, x1: W2 + P, z0: -D2, z1: D2 },
  ];
  for (const r of ROOMS) {
    const { front } = roomZ(r);
    out.push({ x0: r.x0, x1: r.doorX - r.doorW / 2, z0: front - T, z1: front + T });
    out.push({ x0: r.doorX + r.doorW / 2, x1: r.x1, z0: front - T, z1: front + T });
  }
  for (const side of ["top", "bottom"] as const) {
    const z = side === "top" ? { z0: -D2, z1: -ROOM_LINE } : { z0: ROOM_LINE, z1: D2 };
    for (const x of dividerXs(side)) out.push({ x0: x - T, x1: x + T, ...z });
  }
  return out;
}

/** Doimiy mebel to'siqlari (OfficeDecor'dagi joylashuvga mos — mebel u yerda
 *  chiziladi; S8-5 da xonalar qayta jihozlanganda chizish ham shu ma'lumotga
 *  o'tadi). Agent va FPV kamera ular orqali o'tmaydi. */
export function furnitureRects(): Rect[] {
  const out: Rect[] = [];
  const r = (x0: number, x1: number, z0: number, z1: number): void => {
    out.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
  };
  // Reception
  r(-1.7, 1.7, 7.0, 8.0);
  // Server xonasi (rack qatorlari) — orqa qator devorga taqaldi (z=-15.4)
  r(-22, -10, -16.0, -14.8);
  r(-22, -10, -11.6, -10.4);
  // Oshxona — peshtaxta devorga taqaldi (z=-15.5)
  r(-7.6, -2.4, -16.0, -14.8);
  // Majlis stoli (yuqori)
  r(1.9, 5.1, -14.1, -10.9);
  // Xojatxona
  r(9, 12.6, -16, -13.8);
  r(13.2, 15, -16, -14.6);
  // glassA stol
  r(18, 20, -13.8, -11.8);
  // Kutubxona (javonlar + stol) — old qator devorga taqaldi (z=15.68)
  r(-22.6, -14.4, 15.4, 15.9);
  r(-22.6, -14.4, 10.4, 11.6);
  r(-14.8, -12.2, 12, 14);
  // Fokus stoli
  r(-7.8, -6.2, 14, 15.2);
  // Dam olish (divanlar + stol)
  r(0.5, 3.5, 14.2, 15.8);
  r(4.6, 6.4, 12, 14);
  r(1.4, 2.6, 12.4, 13.6);
  // glassB stollari
  r(8.7, 10.3, 13.8, 15.2);
  r(11.7, 13.3, 13.8, 15.2);
  // glassC stol
  r(18, 20, 12, 14);
  // ── Turgan chiroqlar + pol o'simliklari (agent ular ustidan o'tmasin) ──
  // Hammasi nav-qirralaridan chetda joylashtirilgan (OfficeDecor), shu bois bu
  // kichik to'siqlar yo'l grafini uzmaydi — faqat "arvohdek o'tishni" to'xtatadi.
  for (const [x, z] of [[-7, 5], [7, -5]] as [number, number][]) r(x - 0.22, x + 0.22, z - 0.22, z + 0.22); // chiroqlar
  for (const [x, z] of [[-1.5, 5], [1.5, 5], [-16, 6], [16, 6], [-16, -6], [16, -6]] as [number, number][]) r(x - 0.28, x + 0.28, z - 0.28, z + 0.28); // o'simliklar
  return out;
}

/** FPV kamerasi chegarasi (perimetr devoridan 0.6 ichkarida). */
export const FPV_BOUNDS = { x: BUILDING.W / 2 - 0.6, z: BUILDING.D / 2 - 0.6 } as const;

export interface Seat {
  x: number;
  z: number;
  ry: number;
}

// Ish joylari — hamma markazga qaraydi.
//  • 1-6: asosiy ikki ustun (chap/o'ng, x=±5.5).
//  • 7-10: markazdagi qo'shimcha stollar (x=±13).
export const SEATS: Seat[] = [
  { x: -5.5, z: -3.2, ry: -Math.PI / 2 },
  { x: -5.5, z: 0, ry: -Math.PI / 2 },
  { x: -5.5, z: 3.2, ry: -Math.PI / 2 },
  { x: 5.5, z: -3.2, ry: Math.PI / 2 },
  { x: 5.5, z: 0, ry: Math.PI / 2 },
  { x: 5.5, z: 3.2, ry: Math.PI / 2 },
  { x: -13, z: -3, ry: -Math.PI / 2 },
  { x: -13, z: 3, ry: -Math.PI / 2 },
  { x: 13, z: -3, ry: Math.PI / 2 },
  { x: 13, z: 3, ry: Math.PI / 2 },
];
