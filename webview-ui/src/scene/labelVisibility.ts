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
