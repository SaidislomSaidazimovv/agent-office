import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { asset } from "../assets";
import type { AgentStatus } from "../store";
import { STATUS_COLOR } from "./roles";

// ── Rigged (skeletli) GLB personaj — o'tirgan + yozadigan poza ──
// Mixamo skeleti (Hips/Spine/UpLeg/ForeArm...) bone'larини burab, tik
// modelни o'tirgan holatga keltiramiz va yozish animatsiyasi beramiz.

interface Props {
  url: string;
  status: AgentStatus;
}

// Mixamo bone nomlari suffiksli bo'ladi (masalan "Spine_55") — substring bilan qidiramiz.
function findBone(root: THREE.Object3D, name: string): THREE.Bone | undefined {
  let found: THREE.Bone | undefined;
  root.traverse((o) => {
    if (found) return;
    const b = o as THREE.Bone;
    if (b.isBone && b.name.replace(/mixamorig/i, "").includes(name)) found = b;
  });
  return found;
}

// O'tirish pozasi (radian). Mixamo T-poza → stulда yozayotgan holat.
const SEATED: Record<string, [number, number, number]> = {
  LeftUpLeg: [-1.5, 0.05, 0.1],
  RightUpLeg: [-1.5, -0.05, -0.1],
  LeftLeg: [1.7, 0, 0],
  RightLeg: [1.7, 0, 0],
  Spine: [0.12, 0, 0],
  Spine1: [0.05, 0, 0],
  LeftArm: [0.9, 0, 0.35],
  RightArm: [0.9, 0, -0.35],
  LeftForeArm: [0, 0, 0.7],
  RightForeArm: [0, 0, -0.7],
};

export default function RiggedCharacter({ url, status }: Props) {
  const group = useRef<THREE.Group>(null);
  const { scene } = useGLTF(asset(url));

  const cloned = useMemo(() => {
    const c = cloneSkinned(scene);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
      }
    });
    return c;
  }, [scene]);

  const bones = useMemo(() => {
    const map: Record<string, THREE.Bone> = {};
    for (const key of Object.keys(SEATED)) {
      const b = findBone(cloned, key);
      if (b) map[key] = b;
    }
    return map;
  }, [cloned]);

  // O'tirish pozasini qo'llaymiz
  useEffect(() => {
    for (const [key, rot] of Object.entries(SEATED)) {
      const b = bones[key];
      if (b) b.rotation.set(rot[0], rot[1], rot[2]);
    }
  }, [bones]);

  const t = useRef(Math.random() * 10);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    t.current += dt;
    const tt = t.current;
    const working = status === "working" || status === "collab";
    // Yozish — bilaklarни almashib qimirlatamiz
    const lf = bones.LeftForeArm;
    const rf = bones.RightForeArm;
    if (lf) lf.rotation.z = 0.7 + (working ? Math.max(0, Math.sin(tt * 11)) * 0.18 : Math.sin(tt * 1.5) * 0.02);
    if (rf) rf.rotation.z = -0.7 - (working ? Math.max(0, Math.sin(tt * 11 + 1.6)) * 0.18 : Math.sin(tt * 1.5) * 0.02);
    // Nafas — ko'krak
    const sp = bones.Spine1;
    if (sp) sp.rotation.x = 0.05 + Math.sin(tt * (working ? 4 : 1.6)) * 0.02;
  });

  // Auto-fit: bo'yni ~1.5m ga, yerga (o'tirgan holat balandligi)
  const fit = useMemo(() => {
    cloned.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const TARGET_H = 1.35; // o'tirgan balandlik
    const s = size.y > 0 ? TARGET_H / size.y : 1;
    return { s, offset: [-center.x, -box.min.y, -center.z] as [number, number, number] };
  }, [cloned]);

  return (
    <group ref={group}>
      <group scale={fit.s}>
        <primitive object={cloned} position={fit.offset} />
      </group>
      <mesh position={[0, 1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.05, 0.09, 20]} />
        <meshBasicMaterial color={STATUS_COLOR[status]} transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
