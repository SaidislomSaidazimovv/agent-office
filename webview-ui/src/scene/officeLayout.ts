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
/** CHIZILGAN devor yarim qalinligi (ichki devor 0.24 m, perimetr 0.3 m). To'qnashuv
 *  qalinligidan (yuqoridagi) kichikroq — u yurish zaxirasi bilan. Devorga
 *  tegib turadigan detallar (plintus, kontakt qorong'iligi) shu o'lchamdan. */
export const WALL_VIS_HALF = 0.12;
export const PERIM_VIS_HALF = 0.15;

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
 *  va xonalar orasidagi bo'luvchilar. Standart — to'qnashuv qalinligi; chizilgan
 *  yuzaga tegadigan detallar uchun (WALL_VIS_HALF, PERIM_VIS_HALF) beriladi.
 *  `glassFronts: false` — shisha xonalarning old devorlari tashlanadi. */
export function wallRects(T = WALL_HALF, P = PERIM_HALF, glassFronts = true): Rect[] {
  const W2 = BUILDING.W / 2;
  const D2 = BUILDING.D / 2;
  const out: Rect[] = [
    { x0: -W2, x1: W2, z0: -D2 - P, z1: -D2 + P },
    { x0: -W2, x1: W2, z0: D2 - P, z1: D2 + P },
    { x0: -W2 - P, x1: -W2 + P, z0: -D2, z1: D2 },
    { x0: W2 - P, x1: W2 + P, z0: -D2, z1: D2 },
  ];
  for (const r of ROOMS) {
    if (!glassFronts && r.glass) continue;
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

// ── Ochiq maydon mebeli — MA'LUMOT (S8-5) ──
// Chizish (OfficeDecor) ham, to'qnashuv/navigatsiya ham shu ro'yxatdan: mebel
// qo'shilsa yoki ko'chirilsa to'siq o'zi moslashadi. (Ilgari to'siqlar qo'lda
// alohida yozilgan edi va ikki "torsher" to'sig'i (−7,5)/(7,−5) hech qanday
// chizilgan narsasiz qolib ketgan — agentlar ko'rinmas to'siqni aylanardi.)
export type FurnitureType =
  | "reception" | "plant"
  // S8-5: ochiq maydon jihozlari
  | "collabTable" | "standBoard" | "coffeePoint" | "printer" | "lockers" | "phoneBooth" | "planter" | "plantGroup";

export interface FurnitureItem {
  type: FurnitureType;
  x: number;
  z: number;
  /** Aylanish (radian, y o'qi). */
  ry?: number;
  /** Faqat ko'rinish masshtabi (oyoq izi o'zgarmaydi). */
  scale?: number;
}

/** Oyoq izi yarim o'lchamlari (aylanmagan holatda). null — to'siq emas. */
export const FOOTPRINT: Record<FurnitureType, { hx: number; hz: number } | null> = {
  reception: { hx: 1.7, hz: 0.5 },
  plant: { hx: 0.28, hz: 0.28 },
  collabTable: { hx: 1.45, hz: 1.0 }, // stol 2.4×0.9 + bar stullari
  standBoard: { hx: 0.85, hz: 0.25 },
  coffeePoint: { hx: 1.0, hz: 0.33 },
  printer: { hx: 0.8, hz: 0.33 },
  lockers: { hx: 1.5, hz: 0.25 },
  phoneBooth: { hx: 0.6, hz: 0.6 },
  planter: { hx: 1.3, hz: 0.22 },
  plantGroup: { hx: 0.7, hz: 0.7 },
};

export const OPEN_FURNITURE: FurnitureItem[] = [
  { type: "reception", x: 0, z: 7.5 },
  { type: "plant", x: -16, z: 6, scale: 1.1 },
  { type: "plant", x: 16, z: 6, scale: 1.1 },
  { type: "plant", x: -16, z: -6, scale: 1.1 },
  { type: "plant", x: 16, z: -6, scale: 1.1 },
  { type: "plant", x: -1.5, z: 5, scale: 0.9 },
  { type: "plant", x: 1.5, z: 5, scale: 0.9 },
  // ── S8-5: ochiq maydon jihozlari ──
  // (Markaz x ±5.4, z −4.5..−8.4 — S8-6 gacha overflow qatorlari uchun bo'sh.)
  // Hamkorlik zonasi — markazda
  { type: "collabTable", x: 0, z: 1.5 },
  { type: "standBoard", x: 3.4, z: 1.5, ry: -Math.PI / 2 },
  // Kofe nuqtasi va printer burchagi — yuqori xonalar devori yonida (eshiklardan chetda)
  { type: "coffeePoint", x: 6.5, z: -9.05 },
  { type: "printer", x: -7.5, z: -9.05 },
  // Lokerlar va telefon kabinalari — chap devor (iso kameraga qaragan uzoq devor;
  // o'ng devor yaqin tomonda — u yerda faqat orqasi ko'rinardi). Lokerlar devor
  // soati (z −6, 2.35 m) ostida, rasmlar (z 0 va 6) bilan to'qnashmaydi.
  { type: "lockers", x: -22.6, z: -4.4, ry: Math.PI / 2 },
  { type: "phoneBooth", x: -22.2, z: -1.3, ry: Math.PI / 2 },
  { type: "phoneBooth", x: -22.2, z: 1.3, ry: Math.PI / 2 },
  // Ajratkich gultuvaklar — klasterlar bilan markaz orasida
  { type: "planter", x: -8.6, z: -3.5, ry: Math.PI / 2 },
  { type: "planter", x: -8.6, z: 3.5, ry: Math.PI / 2 },
  { type: "planter", x: 8.6, z: -3.5, ry: Math.PI / 2 },
  { type: "planter", x: 8.6, z: 3.5, ry: Math.PI / 2 },
  // O'simlik guruhlari — ochiq maydon burchaklarida
  { type: "plantGroup", x: -21.9, z: -8.4 },
  { type: "plantGroup", x: -21.9, z: 8.4 },
  { type: "plantGroup", x: 21.9, z: -8.4 },
  { type: "plantGroup", x: 21.9, z: 8.4 },
];

/** Buyum oyoq izi (aylanishni hisobga olgan AABB); to'siq bo'lmasa null. */
export function itemRect(it: FurnitureItem): Rect | null {
  const fp = FOOTPRINT[it.type];
  if (!fp) return null;
  const ry = it.ry ?? 0;
  const c = Math.abs(Math.cos(ry)), sn = Math.abs(Math.sin(ry));
  const hx = fp.hx * c + fp.hz * sn;
  const hz = fp.hx * sn + fp.hz * c;
  return { x0: it.x - hx, x1: it.x + hx, z0: it.z - hz, z1: it.z + hz };
}

/** Doimiy mebel to'siqlari (OfficeDecor'dagi joylashuvga mos — mebel u yerda
 *  chiziladi; S8-5 da xonalar qayta jihozlanganda chizish ham shu ma'lumotga
 *  o'tadi). Agent va FPV kamera ular orqali o'tmaydi. */
export function furnitureRects(): Rect[] {
  const out: Rect[] = [];
  const r = (x0: number, x1: number, z0: number, z1: number): void => {
    out.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
  };
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
  // Ochiq maydon mebeli — ma'lumotdan (OPEN_FURNITURE, oyoq izi FOOTPRINT).
  for (const it of OPEN_FURNITURE) {
    const rect = itemRect(it);
    if (rect) out.push(rect);
  }
  return out;
}

/** FPV kamerasi chegarasi (perimetr devoridan 0.6 ichkarida). */
export const FPV_BOUNDS = { x: BUILDING.W / 2 - 0.6, z: BUILDING.D / 2 - 0.6 } as const;

export interface Seat {
  x: number;
  z: number;
  ry: number;
}

// ── Ish joylari: stol klasterlari (S8-5) ──
// Har klaster — 3 ustun × 2 qator stol, qatorlar bir-biriga qaragan, o'rtada
// ajratkich ekran (monitorlar orqama-orqa). Stol 1.5 m (x), chuqurligi 0.8 m.
//  • A qator (ry = π): stol cz − 0.4 da, odam cz − 1.02 da, +z ga (kameraga) qaraydi;
//  • B qator (ry = 0): stol cz + 0.4 da, odam cz + 1.02 da, −z ga qaraydi.
// Klaster egallagan joy: x cx ± 2.25, z cz ± ~1.4. Markaz (x ±9.7) — hamkorlik
// zonasi va (S8-6 gacha) overflow o'rindiqlari uchun bo'sh qoldirilgan.
export interface DeskCluster {
  cx: number;
  cz: number;
  cols: number;
}
export const DESK_W = 1.5;
export const CLUSTERS: DeskCluster[] = [
  { cx: -12.5, cz: -3.5, cols: 3 },
  { cx: -12.5, cz: 3.5, cols: 3 },
  { cx: 12.5, cz: -3.5, cols: 3 },
  { cx: 12.5, cz: 3.5, cols: 3 },
];
/** Klasterlardan o'rindiqlar: indeks = klaster × 6 + qator × 3 + ustun — birinchi
 *  agentlar bir klasterda yonma-yon o'tiradi. */
function clusterSeats(cl: DeskCluster[]): Seat[] {
  const out: Seat[] = [];
  for (const c of cl) {
    for (const [dz, ry] of [[-0.4, Math.PI], [0.4, 0]] as const) {
      for (let i = 0; i < c.cols; i++) {
        out.push({ x: c.cx + (i - (c.cols - 1) / 2) * DESK_W, z: c.cz + dz, ry });
      }
    }
  }
  return out;
}
export const SEATS: Seat[] = clusterSeats(CLUSTERS);
