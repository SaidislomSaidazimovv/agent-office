import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CharSkin } from "./roles";

// ── Protsedural, yarim-realistik personaj (S8-7) ─────────────
// Butun tana BITTA SkinnedMesh: silliq shakllar (kapsula/sfera) bitta
// geometriyaga birlashtirilgan, har bo'lak o'z suyagiga to'liq og'irlik bilan
// bog'langan (qattiq skinning), ranglar vertex rangida → 1 material, 1 draw call.
// Suyaklar avvalgi voxel personaj bo'g'imlari bilan AYNAN bir joyda — o'tirish /
// yozish / yurish pozalari stol va stulga mos keladi.
// Sof modul (React yo'q) — test qilinadi.

/** Suyaklar (tartib = skinIndex). Ota indeksi va ota-nisbiy joylashuv (bog'lash pozasi — tik turish). */
export const BONES = [
  { name: "root", parent: -1, pos: [0, 0, 0] },
  { name: "pelvis", parent: 0, pos: [0, 0.92, 0] },
  { name: "hipL", parent: 1, pos: [-0.09, 0, 0] },
  { name: "kneeL", parent: 2, pos: [0, -0.4, 0] },
  { name: "ankleL", parent: 3, pos: [0, -0.42, 0] },
  { name: "hipR", parent: 1, pos: [0.09, 0, 0] },
  { name: "kneeR", parent: 5, pos: [0, -0.4, 0] },
  { name: "ankleR", parent: 6, pos: [0, -0.42, 0] },
  { name: "spine", parent: 1, pos: [0, 0.09, 0] },
  { name: "shoulderL", parent: 8, pos: [-0.23, 0.28, 0] },
  { name: "elbowL", parent: 9, pos: [0, -0.26, 0] },
  { name: "shoulderR", parent: 8, pos: [0.23, 0.28, 0] },
  { name: "elbowR", parent: 11, pos: [0, -0.26, 0] },
  { name: "head", parent: 8, pos: [0, 0.56, 0] },
  { name: "eyes", parent: 13, pos: [0, 0.02, 0] },
] as const;
export type BoneName = (typeof BONES)[number]["name"];
export const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b.name, i])) as Record<BoneName, number>;

/** Suyakning bog'lash pozasidagi dunyo joylashuvi (ota zanjiri yig'indisi). */
export function bindPosition(name: BoneName): THREE.Vector3 {
  const v = new THREE.Vector3();
  let i: number = BONE_INDEX[name];
  while (i >= 0) {
    const b = BONES[i];
    v.add(new THREE.Vector3(b.pos[0], b.pos[1], b.pos[2]));
    i = b.parent;
  }
  return v;
}

type Part = { g: THREE.BufferGeometry; color: string; bone: BoneName };

/** Bo'lak: geometriyani suyak (bog'lash pozasi) + lokal siljish/aylanish/masshtab
 *  bo'yicha joylashtiradi. */
function part(g: THREE.BufferGeometry, color: string, bone: BoneName, off: [number, number, number], scale: [number, number, number] = [1, 1, 1], rot: [number, number, number] = [0, 0, 0]): Part {
  const m = new THREE.Matrix4().compose(
    bindPosition(bone).add(new THREE.Vector3(...off)),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
  const c = g.clone();
  c.applyMatrix4(m);
  return { g: c, color, bone };
}

const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 3, 8);
const ball = (r: number, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);

/** Rangni to'qroq/ochroq qilish (k: −1…1). */
function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  return "#" + (k < 0 ? c.multiplyScalar(1 + k) : c.lerp(new THREE.Color("#ffffff"), k)).getHexString();
}

const MOUTH = "#8a3d3a";
const PUPIL = "#1c1c24";
const WHITE = "#f4f1ec";

function hairParts(s: CharSkin): Part[] {
  const h = s.hair;
  // Bosh qopqog'i: yuqori yarim sfera, orqaga qiyalatilgan — old cheti peshana
  // tepasida (qosh va ko'z ochiq), orqasi ensani yopadi
  const cap = (r: number, theta: number) => new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, theta);
  const out: Part[] = [part(cap(0.126, Math.PI * 0.56), h, "head", [0, 0.012, 0.008], [1, 1.04, 1.05], [0.7, 0, 0])];
  switch (s.hairStyle) {
    case "long":
      out.push(part(capsule(0.1, 0.16), h, "head", [0, -0.1, 0.07], [1.05, 1, 0.55]));
      break;
    case "afro":
      // Hajmli soch boshning ORQA-yuqorisida: old cheti peshana ustida to'xtaydi
      // (markaz yuzga yaqin bo'lsa, shar yuzni butunlay yopib qo'yardi).
      out.push(part(ball(0.15, 14, 10), h, "head", [0, 0.075, 0.07], [1.12, 1, 1]));
      break;
    case "curly":
      for (const [x, z] of [[-0.07, -0.02], [0.07, -0.02], [0, 0.05], [-0.05, 0.07], [0.05, 0.07], [0, -0.06]]) {
        out.push(part(ball(0.045, 8, 6), h, "head", [x, 0.105, z]));
      }
      break;
    case "medium":
      for (const x of [-0.105, 0.105]) out.push(part(capsule(0.035, 0.08), h, "head", [x, -0.02, 0.02]));
      break;
    case "spiky":
      for (const [x, z, rz] of [[-0.06, 0, 0.3], [0, -0.02, 0], [0.06, 0, -0.3], [-0.03, 0.06, 0.15], [0.03, 0.06, -0.15]]) {
        out.push(part(new THREE.ConeGeometry(0.035, 0.09, 6), h, "head", [x, 0.13, z], [1, 1, 1], [0.2, 0, rz]));
      }
      break;
    default: // short
      break;
  }
  return out;
}

function accessoryParts(s: CharSkin): Part[] {
  switch (s.accessory) {
    case "glasses": {
      const ring = new THREE.TorusGeometry(0.026, 0.005, 6, 14);
      return [
        part(ring, "#22262c", "eyes", [-0.042, 0, -0.112]),
        part(ring, "#22262c", "eyes", [0.042, 0, -0.112]),
        part(box(0.03, 0.005, 0.005), "#22262c", "eyes", [0, 0.005, -0.114]),
      ];
    }
    case "headphones":
      return [
        part(new THREE.TorusGeometry(0.13, 0.012, 6, 18, Math.PI), "#2a2e35", "head", [0, 0.01, 0]),
        part(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), "#3a3f47", "head", [-0.125, -0.005, 0], [1, 1, 1], [0, 0, Math.PI / 2]),
        part(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), "#3a3f47", "head", [0.125, -0.005, 0], [1, 1, 1], [0, 0, Math.PI / 2]),
      ];
    case "cap":
      return [
        part(new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), "#c0392b", "head", [0, 0.03, 0]),
        part(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 14, 1, false, -Math.PI / 2, Math.PI), "#c0392b", "head", [0, 0.035, -0.11], [1, 1, 0.9]),
      ];
    case "beanie":
      return [
        part(new THREE.SphereGeometry(0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), "#3d5a80", "head", [0, 0.025, 0.005], [1, 1.15, 1]),
        part(new THREE.TorusGeometry(0.128, 0.018, 6, 18), "#2f4a6a", "head", [0, 0.03, 0.005], [1, 1, 1], [Math.PI / 2, 0, 0]),
      ];
    default:
      return [];
  }
}

/** Personaj geometriyasi (bog'lash pozasi). `lod: "low"` — yuz tafsilotisiz (kichik yordamchilar). */
export function buildHumanGeometry(s: CharSkin, lod: "high" | "low" = "high"): THREE.BufferGeometry {
  const parts: Part[] = [];
  const legs = (side: "L" | "R") => {
    const hip = `hip${side}` as BoneName, knee = `knee${side}` as BoneName, ankle = `ankle${side}` as BoneName;
    parts.push(part(capsule(0.068, 0.27), s.bottom, hip, [0, -0.2, 0]));
    parts.push(part(capsule(0.056, 0.3), s.bottom, knee, [0, -0.21, 0]));
    // Poyabzal tagi polda (y≈0) va boldir uchini qoplaydi (to'piqda tirqish yo'q).
    parts.push(part(ball(0.06, 10, 6), s.shoes, ankle, [0, -0.045, -0.045], [1.05, 0.9, 1.9]));
  };
  const arms = (side: "L" | "R") => {
    const sh = `shoulder${side}` as BoneName, el = `elbow${side}` as BoneName;
    parts.push(part(ball(0.056, 10, 6), s.top, sh, [side === "L" ? 0.012 : -0.012, -0.015, 0]));
    parts.push(part(capsule(0.052, 0.16), s.top, sh, [0, -0.13, 0]));
    parts.push(part(capsule(0.042, 0.15), s.top, el, [0, -0.1, 0.01]));
    parts.push(part(ball(0.044, 8, 6), s.skin, el, [0, -0.225, 0.02], [0.85, 1.15, 0.75]));
  };
  // Tos (shim) va gavda (ko'ylak) — aylanma profil (lathe): son → bel → ko'krak →
  // yelka bitta silliq egri chiziq. Shim qismi tos suyagiga, ko'ylak gavdaga
  // bog'langan; ular bir-birini qoplaydi — engashganda bo'shliq ochilmaydi.
  // Tos tagi son ostidan pastga tushmaydi — o'tirganda kursi ichiga botmaydi.
  const lathe = (pts: [number, number][]) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  parts.push(part(lathe([[0.001, -0.075], [0.1, -0.07], [0.15, -0.035], [0.155, 0.02], [0.14, 0.1], [0.001, 0.11]]), s.bottom, "pelvis", [0, 0, 0], [1, 1, 0.7]));
  legs("L");
  legs("R");
  parts.push(part(lathe([[0.001, -0.06], [0.135, -0.05], [0.13, 0.04], [0.15, 0.16], [0.165, 0.25], [0.15, 0.31], [0.1, 0.355], [0.05, 0.37], [0.001, 0.372]]), s.top, "spine", [0, 0, 0], [1, 1, 0.66]));
  // Bel chizig'i (kamar) — shim bilan ko'ylak chegarasi
  parts.push(part(new THREE.CylinderGeometry(0.142, 0.142, 0.022, 14, 1, true), shade(s.bottom, -0.35), "pelvis", [0, 0.085, 0], [1, 1, 0.7]));
  parts.push(part(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), s.skin, "spine", [0, 0.42, 0]));
  arms("L");
  arms("R");
  // Bosh
  parts.push(part(ball(0.115, 16, 12), s.skin, "head", [0, 0, 0], [0.95, 1.08, 1]));
  parts.push(...hairParts(s));
  if (lod === "high") {
    for (const x of [-0.042, 0.042]) {
      parts.push(part(ball(0.021, 8, 6), WHITE, "eyes", [x, 0, -0.098], [1, 1, 0.55]));
      parts.push(part(ball(0.011, 6, 4), PUPIL, "eyes", [x, 0, -0.11]));
      parts.push(part(box(0.045, 0.009, 0.012), s.hair, "head", [x, 0.052, -0.103], [1, 1, 1], [0, 0, x < 0 ? 0.12 : -0.12]));
      parts.push(part(ball(0.026, 6, 5), s.skin, "head", [x < 0 ? -0.112 : 0.112, -0.005, 0.01], [0.5, 1, 0.8]));
    }
    parts.push(part(ball(0.02, 8, 6), s.skin, "head", [0, -0.018, -0.116], [1, 1.15, 1.3]));
    parts.push(part(box(0.042, 0.007, 0.01), MOUTH, "head", [0, -0.058, -0.106]));
    parts.push(...accessoryParts(s));
  }

  // Atributlar: position, normal, color, skinIndex, skinWeight (uv tashlanadi)
  const c = new THREE.Color();
  const geos = parts.map(({ g, color, bone }) => {
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", g.getAttribute("position"));
    out.setAttribute("normal", g.getAttribute("normal"));
    if (g.index) out.setIndex(g.index);
    const n = g.getAttribute("position").count;
    c.set(color);
    const col = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      si[i * 4] = BONE_INDEX[bone];
      sw[i * 4] = 1;
    }
    out.setAttribute("color", new THREE.BufferAttribute(col, 3));
    out.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    out.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
    return out;
  });
  const merged = mergeGeometries(geos, false);
  if (!merged) throw new Error("humanRig: geometriyalarni birlashtirib bo'lmadi");
  merged.computeBoundingSphere();
  return merged;
}

/** Bir personaj uchun suyaklar (har nusxaga o'zining). */
export function buildBones(): THREE.Bone[] {
  const bones = BONES.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bone.position.set(b.pos[0], b.pos[1], b.pos[2]);
    return bone;
  });
  BONES.forEach((b, i) => { if (b.parent >= 0) bones[b.parent].add(bones[i]); });
  return bones;
}

// Geometriya keshi — bir xil ko'rinishdagi agentlar bitta geometriyani bo'lishadi.
const geoCache = new Map<string, THREE.BufferGeometry>();
export function humanGeometry(s: CharSkin, lod: "high" | "low"): THREE.BufferGeometry {
  const key = [s.skin, s.hair, s.hairStyle, s.top, s.bottom, s.shoes, s.accessory ?? "", lod].join("|");
  let g = geoCache.get(key);
  if (!g) {
    g = buildHumanGeometry(s, lod);
    geoCache.set(key, g);
  }
  return g;
}
