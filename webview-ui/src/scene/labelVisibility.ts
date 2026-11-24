// ── Agent yorliqlari qachon ko'rinadi (S8-6) ─────────────────
// Kamera uzoqda bo'lsa oddiy yorliqlar yashiriladi — klasterda qo'shni agentlar
// 1.5 m oraliqda o'tiradi va ixcham yorliq (~75 px) zoom ~48 dan past bo'lganda
// qo'shnisinikiga mingashib, umumiy ko'rinishda "yorliq uyumi" bo'lib qolardi.
// Tanlangan va e'tibor talab qilgan agentning yorlig'i HAR DOIM ko'rinadi.
// Sof modul — test qilinadi.

/** HUD "E'tibor" filtri bilan bir xil ta'rif (bitta joyda). */
export function needsAttention(a: { blocked?: boolean; permission?: unknown; stuck?: boolean }): boolean {
  return !!(a.blocked || a.permission || a.stuck);
}

/** Izometrik (ortografik) kamerada oddiy yorliq shu zoom'dan boshlab ko'rinadi
 *  (standart 20, chegara 12…70). 1.5 m × 48 ≈ 72 px — qo'shni yorliqlar ajraladi. */
export const LABEL_ZOOM = 48;
/** Birinchi shaxs (perspektiv) kamerada — shu masofagacha (m). */
export const LABEL_DIST = 9;

export function labelVisible(priority: boolean, cam: { ortho: boolean; zoom: number; dist: number }): boolean {
  if (priority) return true;
  return cam.ortho ? cam.zoom >= LABEL_ZOOM : cam.dist <= LABEL_DIST;
}

export interface LabelBox {
  id: number;
  /** Ekrandagi markaz (px). */
  x: number;
  y: number;
  /** O'lcham (px). */
  w: number;
  h: number;
  priority: boolean;
  /** Kameragacha masofa — yaqini ustun. */
  depth: number;
}

/** Ustma-ust tushmaydigan yorliqlarni tanlaydi (ochko'z): avval ustuvorlar
 *  (tanlangan / e'tibor), so'ng kameraga yaqinlari; joylashtirilganiga
 *  tegadigani yashiriladi. Ustuvor yorliq HAR DOIM ko'rinadi (ustuvorlar
 *  bir-biriga tegsa ham). Natija — ko'rinadigan id'lar. Tartib barqaror. */
export function declutterLabels(boxes: LabelBox[], pad = 3): Set<number> {
  const order = [...boxes].sort((a, b) => Number(b.priority) - Number(a.priority) || a.depth - b.depth || a.id - b.id);
  const placed: LabelBox[] = [];
  const shown = new Set<number>();
  for (const b of order) {
    const hit = placed.some((p) => Math.abs(p.x - b.x) * 2 < p.w + b.w + pad * 2 && Math.abs(p.y - b.y) * 2 < p.h + b.h + pad * 2);
    if (hit && !b.priority) continue;
    placed.push(b);
    shown.add(b.id);
  }
  return shown;
}

// ── Ro'yxat: har avatar o'z yorlig'i va emotsiyasini shu yerga yozadi ──
// (LabelDeclutter komponenti har ~100 ms ko'rinishni hisoblaydi.)
export interface LabelEntry {
  label: { current: HTMLDivElement | null };
  face: { current: HTMLDivElement | null };
  /** Yorliq langari (dunyo koordinatasi) — avatar guruhi + balandlik. */
  anchor: () => { x: number; y: number; z: number } | null;
  priority: () => boolean;
}
export const labelRegistry = new Map<number, LabelEntry>();
