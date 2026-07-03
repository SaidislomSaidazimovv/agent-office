import React, { useMemo } from "react";
import { useGLTF, Clone } from "@react-three/drei";
import * as THREE from "three";

// ── Auto-fit GLB prop ────────────────────────────────────────
// Har xil manbadan olingan modellar har xil o'lcham/pivotда keladi.
// Bu komponent modelni o'lchab (bounding box), maqsad o'lchamiga (fit)
// keltiradi va (ground bo'lsa) ostini yerga qo'yadi, markazini x/z bo'yicha
// `position`ga to'g'rilaydi. Shunda faqat `rotation`ni qo'lda sozlash qoladi.
//
// fitAxis: "height" (box.y) | "width" (box.x) | "depth" (box.z) | "max"
export default function Prop({
  url,
  fit = 1,
  fitAxis = "height",
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  ground = true,
  scaleMul = 1,
}) {
  const { scene } = useGLTF(url);

  const { scale, offset } = useMemo(() => {
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const dim =
      fitAxis === "width" ? size.x
      : fitAxis === "depth" ? size.z
      : fitAxis === "max" ? Math.max(size.x, size.y, size.z)
      : size.y;
    const s = dim > 0 ? (fit / dim) * scaleMul : scaleMul;
    // Model koordinatalarida: markazni 0 ga, ostini (ground) 0 ga keltiruvchi siljish.
    return {
      scale: s,
      offset: [-center.x, ground ? -box.min.y : -center.y, -center.z],
    };
  }, [scene, fit, fitAxis, ground, scaleMul]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <Clone object={scene} position={offset} />
    </group>
  );
}

// Model yuklanmasa (masalan Draco/format xatosi) ilova yiqilmasin.
export class ModelBoundary extends React.Component {
  constructor(p) {
    super(p);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.warn("Prop yuklanmadi:", err?.message);
  }
  render() {
    return this.state.failed ? this.props.fallback ?? null : this.props.children;
  }
}
