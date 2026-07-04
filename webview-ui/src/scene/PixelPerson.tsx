import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { AgentStatus } from "../store";
import type { CharSkin, HairStyle } from "./roles";
import { STATUS_COLOR } from "./roles";

// ── Voxel chibi personaj: o'tirish / turish / yurish ─────────
// pose="sit" — stolда o'tirib yozadi (working/thinking...).
// pose="stand" + moving — tik turib yuradi (bo'sh turганда sayr).

interface Props {
  skin: CharSkin;
  status: AgentStatus;
  pose?: "sit" | "stand";
  moving?: boolean;
  /** Har freym o'qiladi (re-render'siz poza/harakatни yangilash uchun). */
  getState?: () => { sit: boolean; moving: boolean };
}

function damp(c: number, t: number, l: number, dt: number): number {
  return THREE.MathUtils.lerp(c, t, 1 - Math.exp(-l * dt));
}

function Hair({ style, color }: { style: HairStyle; color: string }) {
  const m = () => <meshStandardMaterial color={color} roughness={0.9} />;
  const cap = (
    <mesh position={[0, 0.16, 0]} castShadow>
      <boxGeometry args={[0.33, 0.09, 0.33]} />
      {m()}
    </mesh>
  );
  switch (style) {
    case "short":
      return (<group>{cap}<mesh position={[0, 0.02, 0.13]} castShadow><boxGeometry args={[0.33, 0.3, 0.09]} />{m()}</mesh></group>);
    case "long":
      return (
        <group>{cap}
          {[-0.185, 0.185].map((x) => <mesh key={x} position={[x, -0.14, 0]} castShadow><boxGeometry args={[0.06, 0.4, 0.32]} />{m()}</mesh>)}
          <mesh position={[0, -0.11, 0.15]} castShadow><boxGeometry args={[0.34, 0.5, 0.08]} />{m()}</mesh>
        </group>
      );
    case "afro":
      return (<mesh position={[0, 0.14, 0.01]} castShadow><sphereGeometry args={[0.25, 12, 10]} /><meshStandardMaterial color={color} roughness={0.95} /></mesh>);
    case "curly":
      return (
        <group>
          <mesh position={[0, 0.15, 0.01]} castShadow><sphereGeometry args={[0.215, 12, 10]} /><meshStandardMaterial color={color} roughness={0.95} /></mesh>
          {[-0.16, 0.16].map((x) => <mesh key={x} position={[x, -0.02, 0]} castShadow><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color={color} roughness={0.95} /></mesh>)}
        </group>
      );
    case "spiky":
      return (
        <group>{cap}
          {[-0.1, 0, 0.1].map((x) => [-0.08, 0.08].map((z) => <mesh key={`${x}_${z}`} position={[x, 0.23, z]} rotation={[0.15 * z, 0, 0.2 * x]} castShadow><coneGeometry args={[0.05, 0.13, 4]} />{m()}</mesh>))}
        </group>
      );
    default:
      return (
        <group>{cap}
          <mesh position={[0, -0.02, 0.14]} castShadow><boxGeometry args={[0.34, 0.36, 0.09]} />{m()}</mesh>
          {[-0.185, 0.185].map((x) => <mesh key={x} position={[x, 0, 0.02]} castShadow><boxGeometry args={[0.06, 0.24, 0.3]} />{m()}</mesh>)}
        </group>
      );
  }
}

export default function PixelPerson({ skin: s, status, pose = "sit", moving = false, getState }: Props) {
  const rootRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null); // tos+yuqori (balandligi poza bilan)
  const upperRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const hipL = useRef<THREE.Group>(null);
  const hipR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null);
  const kneeR = useRef<THREE.Group>(null);
  const shoL = useRef<THREE.Group>(null);
  const shoR = useRef<THREE.Group>(null);
  const t = useRef(Math.random() * 10);

  const cloth = (c: string) => <meshStandardMaterial color={c} roughness={0.85} />;
  const skinMat = <meshStandardMaterial color={s.skin} roughness={0.6} />;

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    t.current += dt;
    const tt = t.current;
    const st = getState ? getState() : { sit: pose === "sit", moving };
    const sit = st.sit;
    const working = sit && (status === "working" || status === "collab");
    const thinking = sit && status === "thinking";
    const walk = !sit && st.moving;

    // Tos balandligi
    const pelvisY = sit ? 0.55 : 0.92 + (walk ? Math.abs(Math.sin(tt * 8)) * 0.03 : 0);
    if (bodyRef.current) bodyRef.current.position.y = damp(bodyRef.current.position.y, pelvisY, 12, dt);

    // Oyoqlar (o'tirganда son OLDINGA −z, boldir pastga; yurganда tebranish)
    const swing = walk ? Math.sin(tt * 8) * 0.6 : 0;
    if (hipL.current) hipL.current.rotation.x = damp(hipL.current.rotation.x, sit ? 1.5 : swing, 12, dt);
    if (hipR.current) hipR.current.rotation.x = damp(hipR.current.rotation.x, sit ? 1.5 : -swing, 12, dt);
    if (kneeL.current) kneeL.current.rotation.x = damp(kneeL.current.rotation.x, sit ? -1.5 : walk ? Math.max(0, Math.sin(tt * 8)) * 0.5 : 0.02, 12, dt);
    if (kneeR.current) kneeR.current.rotation.x = damp(kneeR.current.rotation.x, sit ? -1.5 : walk ? Math.max(0, -Math.sin(tt * 8)) * 0.5 : 0.02, 12, dt);

    // Yuqori tana engashishi + NAFAS OLISH (ko'krak ko'tarilib-tushadi)
    let lean = 0.03;
    if (working) lean = 0.2 + Math.sin(tt * 9) * 0.012;
    else if (thinking) lean = -0.04;
    else if (walk) lean = 0.11; // yurганда oldинга engashadi
    const breathe = 1 + Math.sin(tt * (walk ? 5 : working ? 3.5 : 1.9)) * (walk ? 0.014 : 0.024);
    if (upperRef.current) {
      upperRef.current.rotation.x = damp(upperRef.current.rotation.x, lean, 7, dt);
      upperRef.current.scale.y = damp(upperRef.current.scale.y, breathe, 6, dt);
    }

    // Bosh
    let nod = 0, tilt = 0;
    if (thinking) { tilt = 0.2; nod = -0.06; }
    else if (working) nod = 0.2 + Math.sin(tt * 4.5) * 0.03;
    else if (status === "review") nod = 0.14;
    if (headRef.current) {
      headRef.current.rotation.x = damp(headRef.current.rotation.x, nod + Math.sin(tt * 1.6) * 0.02, 7, dt);
      headRef.current.rotation.z = damp(headRef.current.rotation.z, tilt, 6, dt);
    }

    // Yelka/qo'l — o'tirганда OLDINGA (yozish), yurганда tebranish
    const armSwing = walk ? Math.sin(tt * 8) * 0.5 : 0;
    const shTL = sit ? (working ? 0.95 + Math.max(0, Math.sin(tt * 11)) * 0.25 : 0.5) : -armSwing;
    const shTR = sit ? (working ? 0.95 + Math.max(0, Math.sin(tt * 11 + 1.6)) * 0.25 : 0.5) : armSwing;
    if (shoL.current) shoL.current.rotation.x = damp(shoL.current.rotation.x, shTL, 10, dt);
    if (shoR.current) shoR.current.rotation.x = damp(shoR.current.rotation.x, shTR, 10, dt);

    if (rootRef.current) {
      // yurганда tabiiy yon-tebranish, turганда nozik chayqalish, blocked'да asabiy
      const sway = status === "blocked" ? Math.sin(tt * 20) * 0.02 : walk ? Math.sin(tt * 8) * 0.028 : Math.sin(tt * 0.7) * 0.01;
      rootRef.current.rotation.z = damp(rootRef.current.rotation.z, sway, walk ? 9 : 5, dt);
    }
  });

  // Oyoq (son + tizza + boldir + poyabzal), hip pivotда
  const leg = (x: number, hipRef: React.RefObject<THREE.Group>, kneeRef: React.RefObject<THREE.Group>) => (
    <group ref={hipRef} position={[x, 0, 0]}>
      <mesh position={[0, -0.2, 0]} castShadow>
        <boxGeometry args={[0.13, 0.42, 0.14]} />
        {cloth(s.bottom)}
      </mesh>
      <group ref={kneeRef} position={[0, -0.4, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <boxGeometry args={[0.12, 0.42, 0.12]} />
          {cloth(s.bottom)}
        </mesh>
        {/* poyabzal — tovoni orqада, tumshug'i OLDINGA (−z, yuz tomon) */}
        <mesh position={[0, -0.42, -0.05]} castShadow>
          <boxGeometry args={[0.13, 0.1, 0.26]} />
          {cloth(s.shoes)}
        </mesh>
      </group>
    </group>
  );

  // Qo'l (yelka pivot → bilak + kaft)
  const arm = (x: number, shoRef: React.RefObject<THREE.Group>) => (
    <group ref={shoRef} position={[x, 0.28, 0]}>
      <mesh position={[0, -0.13, 0]} castShadow>
        <boxGeometry args={[0.1, 0.26, 0.1]} />
        {cloth(s.top)}
      </mesh>
      <mesh position={[0, -0.32, 0.02]} castShadow>
        <boxGeometry args={[0.09, 0.24, 0.09]} />
        {cloth(s.top)}
      </mesh>
      <mesh position={[0, -0.46, 0.03]} castShadow>
        <boxGeometry args={[0.09, 0.08, 0.09]} />
        {skinMat}
      </mesh>
    </group>
  );

  return (
    <group ref={rootRef}>
      <group ref={bodyRef} position={[0, 0.55, 0]}>
        {/* Tos */}
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[0.34, 0.18, 0.26]} />
          {cloth(s.bottom)}
        </mesh>
        {/* Oyoqlar (tos pastидан) */}
        {leg(-0.09, hipL, kneeL)}
        {leg(0.09, hipR, kneeR)}

        {/* Yuqori tana */}
        <group ref={upperRef} position={[0, 0.09, 0]}>
          <mesh position={[0, 0.22, 0]} castShadow>
            <boxGeometry args={[0.36, 0.4, 0.24]} />
            {cloth(s.top)}
          </mesh>
          {arm(-0.23, shoL)}
          {arm(0.23, shoR)}
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[0.1, 0.08, 0.1]} />
            {skinMat}
          </mesh>
          <group ref={headRef} position={[0, 0.62, 0]}>
            <mesh castShadow><boxGeometry args={[0.3, 0.3, 0.3]} />{skinMat}</mesh>
            {/* ko'zlar (oq + qorachiq) */}
            {[-0.07, 0.07].map((x) => (
              <group key={x} position={[x, 0.025, -0.151]}>
                <mesh><boxGeometry args={[0.05, 0.055, 0.02]} /><meshStandardMaterial color="#f4f0ea" roughness={0.5} /></mesh>
                <mesh position={[0, 0, -0.012]}><boxGeometry args={[0.025, 0.03, 0.01]} /><meshStandardMaterial color="#1a1a22" /></mesh>
              </group>
            ))}
            {/* burun */}
            <mesh position={[0, -0.03, -0.155]}><boxGeometry args={[0.04, 0.05, 0.03]} />{skinMat}</mesh>
            {/* quloqlar */}
            {[-0.157, 0.157].map((x) => <mesh key={x} position={[x, 0.0, 0.01]} castShadow><boxGeometry args={[0.03, 0.08, 0.08]} />{skinMat}</mesh>)}
            <Hair style={s.hairStyle} color={s.hair} />
          </group>
        </group>
      </group>

      {/* Holat halqasi */}
      <mesh position={[0, 1.75, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.06, 0.1, 18]} />
        <meshBasicMaterial color={STATUS_COLOR[status]} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
