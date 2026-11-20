import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Rect } from "./officeLayout";

// ── Kontakt qorong'iligi (arzon AO, S8-3) ────────────────────
// Devor/mebel polga tutashgan joyda yorug'lik kamroq yetadi — haqiqiy xonada
// burchak va devor tagi doim biroz qorong'i. Usiz devorlar polda "suzib"
// turgandek ko'rinardi. Har to'siq to'rtburchagining to'rt tomoniga pol bo'ylab
// ingichka gradient tasma (to'siq chetida qorong'i → tashqarida shaffof).
// Tasmalar ofis rejasidan hosil qilinadi (eshik teshiklari o'z-o'zidan tushib
// qoladi), hammasi BITTA mesh. Burchakda ikki tasma ustma-ust tushib, tabiiy
// ravishda qorong'iroq bo'ladi.

export interface ShadeSet {
  rects: Rect[];
  /** Tasma kengligi (m). */
  width: number;
  /** Qorong'ilik (0..1) — vertex rangning alfa o'rnida (rang = 1 − k). */
  k: number;
}

/** Tasmalar geometriyasi: har to'rtburchak tomoniga bitta to'rtburchak. uv.y:
 *  0 — to'siq chetida, 1 — tashqi chekka (gradient). `clip` — bino ichki
 *  chegarasi (tashqariga tasma chizilmaydi). Sof funksiya. */
export function buildShadeGeometry(sets: ShadeSet[], y: number, clip: Rect): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let n = 0;
  const quad = (a: [number, number], b: [number, number], c: [number, number], d: [number, number], k: number) => {
    // a,b — to'siq cheti (uv.y = 0); c,d — tashqi chekka (uv.y = 1)
    for (const [[x, z], u, v] of [[a, 0, 0], [b, 1, 0], [c, 1, 1], [d, 0, 1]] as [[number, number], number, number][]) {
      pos.push(x, y, z);
      uv.push(u, v);
      col.push(k, k, k);
    }
    const o = n * 4;
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    n++;
  };
  const cx = (x: number) => Math.max(clip.x0, Math.min(clip.x1, x));
  const cz = (z: number) => Math.max(clip.z0, Math.min(clip.z1, z));
  for (const s of sets) {
    const w = s.width;
    for (const r of s.rects) {
      // Har tomon: chiziq bino ichida bo'lsa (chegarada emas) — tasma.
      if (r.z0 > clip.z0 + 1e-6) quad([cx(r.x0), r.z0], [cx(r.x1), r.z0], [cx(r.x1), cz(r.z0 - w)], [cx(r.x0), cz(r.z0 - w)], s.k); // −z tomon
      if (r.z1 < clip.z1 - 1e-6) quad([cx(r.x1), r.z1], [cx(r.x0), r.z1], [cx(r.x0), cz(r.z1 + w)], [cx(r.x1), cz(r.z1 + w)], s.k); // +z
      if (r.x0 > clip.x0 + 1e-6) quad([r.x0, cz(r.z1)], [r.x0, cz(r.z0)], [cx(r.x0 - w), cz(r.z0)], [cx(r.x0 - w), cz(r.z1)], s.k); // −x
      if (r.x1 < clip.x1 - 1e-6) quad([r.x1, cz(r.z0)], [r.x1, cz(r.z1)], [cx(r.x1 + w), cz(r.z1)], [cx(r.x1 + w), cz(r.z0)], s.k); // +x
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// Gradient — faqat v bo'yicha (to'siq chetida 1, tashqarida 0), kulrang
// qiymat sifatida. Vertex rang (k) bilan ko'paytirilib, three'ning
// SubtractiveBlending'i orqali qo'llanadi: pol = pol × (1 − k·gradient) — har
// qanday pol rangini bir xil NISBATDA qoraytiradi (och ham, to'q ham).
let tex: THREE.CanvasTexture | null = null;
function shadeTexture(): THREE.CanvasTexture {
  if (tex) return tex;
  const H = 64;
  const cv = document.createElement("canvas");
  cv.width = 4;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(4, H);
  for (let y = 0; y < H; y++) {
    const t = (y + 0.5) / H; // 0 — chet, 1 — tashqi
    const a = (1 - t) ** 2.2;
    for (let x = 0; x < 4; x++) {
      const o = (y * 4 + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(255 * a);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex = new THREE.CanvasTexture(cv);
  tex.flipY = false; // v=0 — kanvasning yuqori qatori (chet)
  return tex;
}

let mat: THREE.MeshBasicMaterial | null = null;
function shadeMaterial(): THREE.MeshBasicMaterial {
  if (mat) return mat;
  mat = new THREE.MeshBasicMaterial({
    map: shadeTexture(),
    vertexColors: true,
    transparent: true,
    blending: THREE.SubtractiveBlending,
    premultipliedAlpha: true, // three: SubtractiveBlending faqat shu bilan ishlaydi
    depthWrite: false,
    toneMapped: false,
    // Pol (va ish zonasi poli) ustida turishi uchun — nur dog'lari bilan bir xil.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  return mat;
}

const noRaycast = () => {};

export function ContactShade({ sets, y, clip }: { sets: ShadeSet[]; y: number; clip: Rect }) {
  const geo = useMemo(() => buildShadeGeometry(sets, y, clip), [sets, y, clip]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={shadeMaterial()} raycast={noRaycast} userData={{ noBatch: true }} renderOrder={1} />;
}
