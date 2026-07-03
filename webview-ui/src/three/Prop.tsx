import { Clone, useGLTF } from "@react-three/drei";
import React, { useMemo } from "react";
import * as THREE from "three";
import { asset } from "../assets";

// ── Auto-fit GLB prop ────────────────────────────────────────
// Modelни o'lchab (bounding box), maqsad o'lchamiga (fit) keltiradi va
// (ground bo'lsa) ostini yerga qo'yadi, markazini x/z bo'yicha to'g'rilaydi.
// Shunda faqat rotationни qo'lda sozlash qoladi.

type FitAxis = "height" | "width" | "depth" | "max";
type Vec3 = [number, number, number];

interface PropProps {
  url: string;
  fit?: number;
  fitAxis?: FitAxis;
  position?: Vec3;
  rotation?: Vec3;
  ground?: boolean;
  scaleMul?: number;
}

export default function Prop({
  url,
  fit = 1,
  fitAxis = "height",
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  ground = true,
  scaleMul = 1,
}: PropProps) {
  const { scene } = useGLTF(asset(url));

  const { scale, offset } = useMemo(() => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
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
    const off: Vec3 = [-center.x, ground ? -box.min.y : -center.y, -center.z];
    return { scale: s, offset: off };
  }, [scene, fit, fitAxis, ground, scaleMul]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <Clone object={scene} position={offset} />
    </group>
  );
}

// Model yuklanmasa (Draco/format xatosi) ilova yiqilmasin.
export class ModelBoundary extends React.Component<
  { fallback?: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  constructor(p: { fallback?: React.ReactNode; children: React.ReactNode }) {
    super(p);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("Prop yuklanmadi:", (err as Error)?.message);
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
