import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useDaylight } from "./daylight";
import { BUILDING, PERIM_HALF } from "./officeLayout";

// ── Soxta yorug'lik dog'lari (S8-3) ──────────────────────────
// Tungi lampalar ilgari haqiqiy pointLight edi (11 ta + har joylashtirilgan
// torsher). Ikki muammo: (1) har yoritiladigan PIKSELDA hamma nur hisoblanardi
// — tun kunduzdan og'ir; (2) nurlar soni o'zgarganda (kun↔tun, kechasi torsher
// qo'yilganda) three BARCHA materiallarning shaderini qayta kompilyatsiya
// qilardi — sezilarli qotish. Endi nur dog'i — radial gradientli, qo'shiluvchi
// (additive) yassi to'rtburchak: pol (yoki devor) ustiga iliq yorug'lik "qo'shadi".
// Hamma dog'lar BITTA mesh (bitta draw call), nur hisob-kitobi yo'q.

export type PoolFace = "up" | "south" | "north";

export interface Pool {
  x: number;
  /** Balandlik: pol dog'i uchun ~0.04, devor dog'i uchun markaz balandligi. */
  y: number;
  z: number;
  /** Radius (m). */
  r: number;
  color: string;
  /** Kuch (0..~1) — rang shunga ko'paytiriladi. */
  k: number;
  /** "up" — polda yotadi; "south" — devorda, +z tomonga qaragan; "north" — −z. */
  face?: PoolFace;
  /** Faqat "up": dog' shu to'rtburchakda kesiladi (xona/ochiq maydon chegarasi) —
   *  nur devordan o'tib qo'shni xonaga yoki bino tashqarisiga tushmasin. */
  clip?: { x0: number; x1: number; z0: number; z1: number };
}

/** Dog'lar uchun bitta geometriya: har dog' — 2 uchburchak (4 cho'qqi),
 *  uv 0..1 (gradient tekstura), rang = color × k (vertex rang). Sof funksiya. */
export function buildPoolGeometry(pools: Pool[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  let n = 0;
  for (const p of pools) {
    c.set(p.color).multiplyScalar(p.k);
    const f = p.face ?? "up";
    // Lokal tekislikdagi oraliq (−1..1); "up" dog'i kesilsa toraytiriladi.
    let u0 = -1, u1 = 1, v0 = -1, v1 = 1;
    if (f === "up" && p.clip) {
      u0 = Math.max(-1, (p.clip.x0 - p.x) / p.r);
      u1 = Math.min(1, (p.clip.x1 - p.x) / p.r);
      // "up": z = p.z − v·r → v = (p.z − z) / r
      v0 = Math.max(-1, (p.z - p.clip.z1) / p.r);
      v1 = Math.min(1, (p.z - p.clip.z0) / p.r);
      if (u0 >= u1 || v0 >= v1) continue; // to'liq chegaradan tashqarida
    }
    for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]) {
      if (f === "up") pos.push(p.x + u * p.r, p.y, p.z - v * p.r);
      else if (f === "south") pos.push(p.x + u * p.r, p.y + v * p.r, p.z);
      else pos.push(p.x - u * p.r, p.y + v * p.r, p.z);
      uv.push((u + 1) / 2, (v + 1) / 2);
      col.push(c.r, c.g, c.b);
    }
    const b = n * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    n++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// Gradient tekstura — bir marta (birinchi tunda) canvas'da chiziladi.
// Markaz yorqinroq (nur kuchi masofa bilan tez kamayadi), chekka 0 ga silliq tushadi.
let tex: THREE.CanvasTexture | null = null;
function poolTexture(): THREE.CanvasTexture {
  if (tex) return tex;
  const N = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // 0.94 — chetda to'liq shaffof halqa (filtrlashda burchakka "oqmasin").
      const d = Math.min(1, Math.hypot((x + 0.5) / N * 2 - 1, (y + 0.5) / N * 2 - 1) / 0.94);
      const a = 0.8 * (1 - d * d) ** 2 + 0.2 * (1 - d) ** 3;
      const o = (y * N + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(255 * a);
    }
  }
  ctx.putImageData(img, 0, 0);
  tex = new THREE.CanvasTexture(cv);
  return tex;
}

let mat: THREE.MeshBasicMaterial | null = null;
function poolMaterial(): THREE.MeshBasicMaterial {
  if (mat) return mat;
  mat = new THREE.MeshBasicMaterial({
    map: poolTexture(),
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    // Ish zonasi poli polygonOffset bilan kameraga tortilgan; iso kameraning
    // qiya burchagida bu siljish dog'ning 3 sm balandligidan oshib, dog' qisman
    // pol "ortida" qolardi (pog'onali chiziqlar). Kuchliroq siljish (−2 > −1) —
    // dog' doim pol ustida; mebel baribir uni to'sadi.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  // Bino perimetridan tashqaridagi piksellar tashlanadi — joyi oldindan ma'lum
  // bo'lmagan dog' (foydalanuvchi qo'ygan torsher devor yonida) ham bino
  // tashqarisidagi qora fonga "porlab" chiqmasin.
  const hx = (BUILDING.W / 2 - PERIM_HALF).toFixed(3);
  const hz = (BUILDING.D / 2 - PERIM_HALF).toFixed(3);
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = "varying vec3 vPoolWorld;\n" + sh.vertexShader.replace(
      "#include <project_vertex>",
      "#include <project_vertex>\n  vPoolWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
    );
    sh.fragmentShader = "varying vec3 vPoolWorld;\n" + sh.fragmentShader.replace(
      "void main() {",
      `void main() {\n  if (abs(vPoolWorld.x) > ${hx} || abs(vPoolWorld.z) > ${hz}) discard;`,
    );
  };
  return mat;
}

const noRaycast = () => {};

/** Tungi yorug'lik dog'lari — faqat lampalar yonganda chiziladi (kunduzi null). */
export function LightPools({ pools }: { pools: Pool[] }) {
  const lampsOn = useDaylight((s) => s.params.lamps);
  const geo = useMemo(() => buildPoolGeometry(pools), [pools]);
  useEffect(() => () => geo.dispose(), [geo]);
  if (!lampsOn) return null;
  return <mesh geometry={geo} material={poolMaterial()} raycast={noRaycast} userData={{ noBatch: true }} renderOrder={2} />;
}
