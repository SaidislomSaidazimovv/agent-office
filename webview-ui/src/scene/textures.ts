import * as THREE from "three";
import type { FloorKind } from "./officeLayout";

// ── Protsedural pol teksturalari (S8-3) ──────────────────────
// Rasm fayli yo'q (CSP: tarmoq yo'q, asset paketi kichik qoladi) — har biri
// birinchi ishlatilganda canvas'da BIR MARTA chiziladi. Teksturalar KULRANG
// KO'PAYTIRUVCHI (~0.8..1.0): material rangi (mavzu/xona rangi) saqlanadi, ustiga
// faqat naqsh (taxta, plitka, kafel choki, beton dog'lari) qo'shiladi.
// Pol UV'lari dunyo koordinatasida (floorGeometry) — tekstura zichligi hamma
// polda bir xil va bir xil teksturali pollar birlashtiriladi (batchable).

export type { FloorKind };

/** Bitta tekstura takrori necha metrni qoplaydi (dunyo o'lchami). */
export const FLOOR_TEX_SIZE: Record<FloorKind, number> = {
  carpet: 2, // 4×4 plitka × 0.5 m
  wood: 3.2, // 16 qator × 0.2 m taxta (1.6 m uzunlikda)
  tile: 1.2, // 4×4 kafel × 0.3 m
  concrete: 4,
};

/** Polni XZ tekisligida (y=0, normal yuqoriga) yasaydi; UV = dunyo koordinatasi
 *  / `size` — shunda bir xil tekstura har xil o'lchamli pollarda bir xil
 *  zichlikda va choklar bino bo'ylab uzluksiz. Sof funksiya. */
export function floorGeometry(x0: number, x1: number, z0: number, z1: number, size: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // Yuqoriga qaragan (CCW tepadan): (x0,z1) (x1,z1) (x1,z0) (x0,z0)
  const pos = [x0, 0, z1, x1, 0, z1, x1, 0, z0, x0, 0, z0];
  const uv = [x0 / size, -z1 / size, x1 / size, -z1 / size, x1 / size, -z0 / size, x0 / size, -z0 / size];
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeBoundingSphere();
  return g;
}

// Deterministik tasodif (har ochilishda bir xil naqsh).
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const N = 512;

function paint(draw: (px: (x: number, y: number, v: number) => void, r: () => number) => void, seed: number): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(N, N);
  const px = (x: number, y: number, v: number) => {
    const o = (((y % N) + N) % N * N + (((x % N) + N) % N)) * 4;
    const c = Math.max(0, Math.min(255, Math.round(v * 255)));
    img.data[o] = img.data[o + 1] = img.data[o + 2] = c;
    img.data[o + 3] = 255;
  };
  draw(px, rng(seed));
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace; // qiymat to'g'ridan-to'g'ri ko'paytiruvchi
  t.anisotropy = 4; // iso kamera polga qiya qaraydi — naqsh xiralashmasin
  t.userData.batchable = true; // batching.ts: shu tekstura bilan birlashtirish xavfsiz
  return t;
}

// Gilam plitkasi: 4×4 plitka, har birining tusi ozgina farqli, nozik chok va tola donadorligi.
function carpet(): THREE.CanvasTexture {
  return paint((px, r) => {
    const T = N / 4;
    const tone = Array.from({ length: 16 }, () => 0.93 + r() * 0.05);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = tone[Math.floor(y / T) * 4 + Math.floor(x / T)];
      const seam = x % T === 0 || y % T === 0 ? 0.9 : 1;
      px(x, y, t * seam * (0.965 + r() * 0.05));
    }
  }, 11);
}

// Yog'och taxtalar: 0.2 m qatorlar, 1.6 m taxtalar siljigan uchlar bilan, tolalar va tus farqi.
function wood(): THREE.CanvasTexture {
  return paint((px, r) => {
    // Qator balandligi BUTUN piksel bo'lishi shart (512/16 = 32) — kasr bo'lsa
    // sikl kasr indekslarga yozib, har ikkinchi qator bo'sh (qora) qolardi.
    const rows = 16;
    const H = N / rows;
    for (let row = 0; row < rows; row++) {
      // Har qatorda 2 taxta (1.2 m), uchlari tasodifiy siljigan
      const shift = Math.floor(r() * N);
      const tones = [0.86 + r() * 0.12, 0.86 + r() * 0.12];
      const phase = [r() * 100, r() * 100];
      for (let y = row * H; y < (row + 1) * H; y++) {
        for (let x = 0; x < N; x++) {
          const xs = (x + shift) % N;
          const k = xs < N / 2 ? 0 : 1;
          const edge = y === row * H || xs === 0 || xs === N / 2 ? 0.78 : 1;
          const grain = 0.95 + 0.05 * Math.sin(xs * 0.05 + phase[k] + Math.sin(y * 0.6 + phase[k]) * 1.5);
          px(x, y, tones[k] * edge * grain);
        }
      }
    }
  }, 23);
}

// Kafel: 4×4, kul chok (grout), har kafel tusi biroz farqli.
function tile(): THREE.CanvasTexture {
  return paint((px, r) => {
    const T = N / 4;
    const tone = Array.from({ length: 16 }, () => 0.95 + r() * 0.05);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const gx = x % T, gy = y % T;
      const grout = gx < 3 || gy < 3 ? 0.72 : 1;
      px(x, y, grout === 1 ? tone[Math.floor(y / T) * 4 + Math.floor(x / T)] * (0.985 + r() * 0.015) : grout);
    }
  }, 37);
}

// Silliqlangan beton: past chastotali dog'lar + mayda donadorlik.
function concrete(): THREE.CanvasTexture {
  return paint((px, r) => {
    const G = 16; // dog'lar to'ri (tileable)
    const grid = Array.from({ length: G * G }, () => r());
    const at = (i: number, j: number) => grid[((j % G) + G) % G * G + (((i % G) + G) % G)];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = (x / N) * G, fy = (y / N) * G;
      const i = Math.floor(fx), j = Math.floor(fy);
      const tx = fx - i, ty = fy - j;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const n = (at(i, j) * (1 - sx) + at(i + 1, j) * sx) * (1 - sy) + (at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx) * sy;
      // Nozik: iso umumiy ko'rinishda kuchli dog'lar "kir pol" bo'lib ko'rinardi.
      px(x, y, 0.955 + n * 0.035 + (r() - 0.5) * 0.015);
    }
  }, 53);
}

const cache = new Map<FloorKind, THREE.CanvasTexture>();
/** Pol teksturasi (birinchi chaqiruvda chiziladi, keyin kesh). */
export function floorTexture(kind: FloorKind): THREE.CanvasTexture {
  let t = cache.get(kind);
  if (!t) {
    t = kind === "carpet" ? carpet() : kind === "wood" ? wood() : kind === "tile" ? tile() : concrete();
    cache.set(kind, t);
  }
  return t;
}
