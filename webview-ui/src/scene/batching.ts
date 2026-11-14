import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ── Statik sahnani birlashtirish (draw call kamaytirish) ─────
// Har mebel bo'lagi alohida mesh = alohida draw call (S8-0: bo'sh ofis 1216).
// Bu funksiya berilgan ildiz ostidagi STATIK mesh'larni bir xil yorug'lik
// xususiyatlari bo'yicha guruhlaydi (rang farqi — vertex rangi orqali) va har
// guruhni BITTA mesh qiladi. Asl mesh'lar o'chirilmaydi — faqat yashiriladi
// (React ularni boshqarishda davom etadi; unbatch() ularni qaytaradi).
//
// Birlashtirilmaydi:
//  • `userData.noBatch` belgilangan obyekt va uning BUTUN pastki daraxti
//    (animatsiya, kun/tun, holatga bog'liq narsalar);
//  • teksturali (map), shaffof, ko'rinmas, ko'p materialli, instanced/skinned mesh;
//  • MeshStandardMaterial bo'lmagan materiallar.
// Ko'rinish o'zgarmaydi: vertex rangi × oq material = asl material rangi.

export interface BatchResult {
  /** Ildizga qo'shilgan birlashgan mesh'lar. */
  batches: THREE.Mesh[];
  /** Yashirilgan asl mesh'lar (unbatch qaytaradi). */
  hidden: THREE.Mesh[];
}

function eligible(m: THREE.Mesh): m is THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return false;
  if (!m.visible || Array.isArray(m.material)) return false;
  const mat = m.material as THREE.Material;
  if ((mat as THREE.MeshStandardMaterial).type !== "MeshStandardMaterial") return false;
  const s = mat as THREE.MeshStandardMaterial;
  if (s.map || s.emissiveMap || s.alphaMap || s.normalMap || s.roughnessMap || s.metalnessMap || s.aoMap) return false;
  if (s.transparent || s.opacity < 1 || !s.visible || s.vertexColors) return false;
  const g = m.geometry;
  if (!g || !g.getAttribute("position") || !g.getAttribute("normal") || Object.keys(g.morphAttributes).length > 0) return false;
  return true;
}

/** Bir xil yorug'lik xususiyatlari — bitta birlashma (rang bundan tashqari). */
function keyOf(m: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>): string {
  const s = m.material;
  return [
    s.roughness, s.metalness, s.emissive.getHexString(), s.emissiveIntensity, s.toneMapped ? 1 : 0, s.side, s.flatShading ? 1 : 0,
    s.depthWrite ? 1 : 0, s.depthTest ? 1 : 0, s.polygonOffset ? `${s.polygonOffsetFactor},${s.polygonOffsetUnits}` : "-",
    m.castShadow ? 1 : 0, m.receiveShadow ? 1 : 0,
  ].join("|");
}

/** Geometriyani ildiz koordinatasiga o'tkazadi; faqat position+normal+color qoladi
 *  (barcha bo'laklar bir xil atributlarga ega bo'lishi shart). */
function prepared(m: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>, toRoot: THREE.Matrix4): THREE.BufferGeometry {
  const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", src.getAttribute("position").clone());
  g.setAttribute("normal", src.getAttribute("normal").clone());
  const mat = new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld);
  g.applyMatrix4(mat);
  // Manfiy determinant (ko'zgu scale) uchburchak aylanishini teskari qiladi —
  // old/orqa yuz almashmasin uchun har uchburchakning 2-3 cho'qqisini almashtiramiz.
  if (mat.determinant() < 0) {
    for (const name of ["position", "normal"]) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i += 3) {
        const x = a.getX(i + 1), y = a.getY(i + 1), z = a.getZ(i + 1);
        a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
        a.setXYZ(i + 2, x, y, z);
      }
    }
  }
  // Material rangi (three ichida chiziqli rang fazosida saqlanadi — vertex rangi
  // ham chiziqli talqin qilinadi, shuning uchun to'g'ridan-to'g'ri ko'chiramiz).
  const c = m.material.color;
  const n = g.getAttribute("position").count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  if (src !== m.geometry) src.dispose();
  return g;
}

/** `root` ostidagi statik mesh'larni birlashtiradi. */
export function batchStatic(root: THREE.Object3D): BatchResult {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { sample: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] }>();

  const walk = (o: THREE.Object3D) => {
    if (o.userData && o.userData.noBatch) return; // butun pastki daraxt dinamik
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && eligible(m)) {
      const k = keyOf(m);
      const gr = groups.get(k);
      if (gr) gr.meshes.push(m);
      else groups.set(k, { sample: m, meshes: [m] });
    }
    for (const ch of o.children) walk(ch);
  };
  for (const ch of root.children) walk(ch);

  const batches: THREE.Mesh[] = [];
  const hidden: THREE.Mesh[] = [];
  for (const { sample, meshes } of groups.values()) {
    if (meshes.length < 2) continue; // bittasini birlashtirishdan foyda yo'q
    const geos = meshes.map((m) => prepared(m, toRoot));
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const s = sample.material;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: s.roughness,
      metalness: s.metalness,
      emissive: s.emissive.clone(),
      emissiveIntensity: s.emissiveIntensity,
      side: s.side,
      flatShading: s.flatShading,
      depthWrite: s.depthWrite,
      depthTest: s.depthTest,
      polygonOffset: s.polygonOffset,
      polygonOffsetFactor: s.polygonOffsetFactor,
      polygonOffsetUnits: s.polygonOffsetUnits,
    });
    mat.toneMapped = s.toneMapped;
    const batch = new THREE.Mesh(merged, mat);
    batch.name = "static-batch";
    batch.castShadow = sample.castShadow;
    batch.receiveShadow = sample.receiveShadow;
    batch.raycast = () => {}; // bosish/raycast asl obyektlarda emas — dekor interaktiv emas
    root.add(batch);
    batches.push(batch);
    for (const m of meshes) {
      m.visible = false;
      hidden.push(m);
    }
  }
  return { batches, hidden };
}

/** batchStatic natijasini bekor qiladi (qayta qurishdan oldin yoki unmount'da). */
export function unbatch(root: THREE.Object3D, r: BatchResult): void {
  for (const b of r.batches) {
    root.remove(b);
    b.geometry.dispose();
    (b.material as THREE.Material).dispose();
  }
  for (const m of r.hidden) m.visible = true;
}
