import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { declutterLabels, type LabelBox, labelRegistry, labelVisible } from "./labelVisibility";

// ── Yorliq va emotsiyalar ko'rinishi (S8-6) ──────────────────
// Har ~100 ms: (1) masofa qoidasi (labelVisible) — uzoqda faqat ustuvorlar;
// (2) qolgan yorliqlar ekranda ustma-ust tushsa, ustuvor / kameraga yaqini
// qoladi (declutterLabels). Emotsiya faqat (1) ga bo'ysunadi. React qayta
// renderisiz — DOM display'i faqat o'zgarganda almashtiriladi. Avval barcha
// o'lchamlar O'QILADI, keyin YOZILADI (brauzer layout'i bir marta hisoblanadi).

const INTERVAL = 0.1; // s
const FALLBACK = { w: 80, h: 20 }; // hali o'lchanmagan yorliq (px)

function setDisplay(el: HTMLElement | null, show: boolean): void {
  if (!el) return;
  const d = show ? "" : "none";
  if (el.style.display !== d) el.style.display = d;
}

export default function LabelDeclutter() {
  const acc = useRef(0);
  const sizes = useRef(new Map<number, { w: number; h: number }>());
  const v = useRef(new THREE.Vector3());
  useFrame(({ camera, size }, delta) => {
    acc.current += delta;
    if (acc.current < INTERVAL) return;
    acc.current = 0;
    const ortho = (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
    const boxes: LabelBox[] = [];
    const base = new Map<number, boolean>();
    // 1) O'qish: masofa qoidasi, ekran joyi, o'lcham
    for (const [id, e] of labelRegistry) {
      const a = e.anchor();
      if (!a) continue;
      const pr = e.priority();
      const dist = camera.position.distanceTo(v.current.set(a.x, a.y, a.z));
      const ok = labelVisible(pr, { ortho, zoom: camera.zoom, dist });
      base.set(id, ok);
      const el = e.label.current;
      if (!ok || !el) continue;
      if (el.offsetWidth > 0) sizes.current.set(id, { w: el.offsetWidth, h: el.offsetHeight });
      v.current.project(camera);
      if (v.current.z < -1 || v.current.z > 1) continue; // kameradan orqada / tashqarida
      const s = sizes.current.get(id) ?? FALLBACK;
      boxes.push({ id, x: ((v.current.x + 1) / 2) * size.width, y: ((1 - v.current.y) / 2) * size.height, w: s.w, h: s.h, priority: pr, depth: dist });
    }
    const shown = declutterLabels(boxes);
    // 2) Yozish
    for (const [id, e] of labelRegistry) {
      const ok = base.get(id) ?? false;
      setDisplay(e.label.current, ok && shown.has(id));
      setDisplay(e.face.current, ok);
    }
  });
  return null;
}
