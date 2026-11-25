import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { AgentStatus } from "../store";
import HumanFigure from "./HumanFigure";
import { cyl, stdMat, UNIT_BOX } from "./resources";
import type { CharSkin } from "./roles";

// ── Galereya (?gallery) — personajni ish joyida, tabiiy o'tirish pozasida ko'rsatish ──
// Faqat tekshirish rejimi uchun. O'lchamlar ofisdagi ish joyi bilan bir xil
// (stol 0.72 m, kursi o'tirgichi 0.46 m, odam stol markazidan 0.72 m orqada) —
// galereyadagi poza ofisdagidek ko'rinadi.

type V3 = [number, number, number];
const DESK_TOP = 0.72;
const TOP_M = stdMat("#f2efe9", { roughness: 0.4 });
const EDGE_M = stdMat("#2a2e35", { roughness: 0.4 });
const LEG_M = stdMat("#4a4f57", { roughness: 0.45, metalness: 0.25 });
const CHAIR_M = stdMat("#2c313a", { roughness: 0.6 });
const ARM_M = stdMat("#1c2027");
const POST_M = stdMat("#8b929c", { roughness: 0.35, metalness: 0.5 });
const LAPTOP_M = stdMat("#b9bec6", { roughness: 0.35, metalness: 0.4 });
const SCREEN_M = stdMat("#1d2a3a", { roughness: 0.25, emissive: "#24405e", emissiveIntensity: 0.6 });
const MUG_M = stdMat("#ffffff", { roughness: 0.4 });

function B({ p, s, m }: { p: V3; s: V3; m: THREE.Material }) {
  return <mesh position={p} scale={s} geometry={UNIT_BOX} material={m} castShadow receiveShadow />;
}

export interface GalleryPose {
  status: AgentStatus;
  /** HumanFigure `idleStyle` — faqat status "idle" bo'lganda. */
  idleStyle?: number;
  /** Ostidagi izoh (poza nomi). */
  caption: string;
}

export default function GalleryStation({ skin, pose, position, ry }: { skin: CharSkin; pose: GalleryPose; position: V3; ry: number }) {
  return (
    <group position={position} rotation={[0, ry, 0]}>
      {/* Stol */}
      <B p={[0, DESK_TOP, 0]} s={[1.2, 0.05, 0.7]} m={TOP_M} />
      <B p={[0, DESK_TOP - 0.035, 0]} s={[1.22, 0.025, 0.72]} m={EDGE_M} />
      {[-0.54, 0.54].map((x) => <B key={x} p={[x, DESK_TOP / 2 - 0.03, 0]} s={[0.05, DESK_TOP - 0.06, 0.6]} m={LEG_M} />)}
      {/* Noutbuk (past — yuzni to'smaydi) + krujka */}
      <group position={[0, DESK_TOP + 0.03, 0.05]}>
        <B p={[0, 0, 0]} s={[0.36, 0.015, 0.25]} m={LAPTOP_M} />
        <group position={[0, 0.005, -0.12]} rotation={[-0.32, 0, 0]}>
          <B p={[0, 0.12, 0]} s={[0.36, 0.24, 0.012]} m={LAPTOP_M} />
          <B p={[0, 0.12, 0.007]} s={[0.33, 0.21, 0.002]} m={SCREEN_M} />
        </group>
      </group>
      <mesh position={[0.42, DESK_TOP + 0.075, 0.12]} castShadow geometry={cyl(0.045, 0.04, 0.1, 12)} material={MUG_M} />
      {/* Ofis kursisi — ofisdagi bilan bir xil o'lcham */}
      <group position={[0, 0, 0.62]}>
        <B p={[0, 0.46, 0]} s={[0.48, 0.07, 0.48]} m={CHAIR_M} />
        <B p={[0, 0.74, 0.22]} s={[0.46, 0.5, 0.06]} m={CHAIR_M} />
        {[-0.26, 0.26].map((x) => <B key={x} p={[x, 0.56, 0.05]} s={[0.05, 0.04, 0.3]} m={ARM_M} />)}
        <mesh position={[0, 0.22, 0]} geometry={cyl(0.04, 0.05, 0.44, 10)} material={POST_M} />
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          return <B key={i} p={[Math.cos(a) * 0.22, 0.04, Math.sin(a) * 0.22]} s={[0.22, 0.04, 0.05]} m={LEG_M} />;
        })}
      </group>
      {/* Personaj — stolga qarab o'tiradi (old tomoni −z) */}
      <group position={[0, 0, 0.72]}>
        <HumanFigure skin={skin} status={pose.status} pose="sit" idleStyle={pose.idleStyle} />
      </group>
      <Html position={[0, 1.95, 0.72]} center style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
        <div style={{ fontFamily: "system-ui", color: "#fff", textAlign: "center", whiteSpace: "nowrap", textShadow: "0 1px 3px #000" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{skin.label}</div>
          <div style={{ fontSize: 11, opacity: 0.75 }}>{pose.caption}</div>
        </div>
      </Html>
    </group>
  );
}
