import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { AgentStatus } from "../store";
import type { CharSkin, HairStyle } from "./roles";
import { STATUS_COLOR } from "./roles";

// ── Voxel/blokli chibi 3D personaj ───────────────────────────
// Pixel Agents sprite'larining buzilishsiz 3D tarjimasi: blokli tana,
// katta bosh, oddiy yuz. Palitra (teri/soch/ko'ylak/shim) rolga qarab.
// O'tirgan holatda: oyoqlar oldinга (−z) stol ostiga, yozish animatsiyasi.

interface Props {
  skin: CharSkin;
  status: AgentStatus;
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

// ── Soch uslublari (headRef ichида — bosh markazи = lokal 0, kub 0.3) ──
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
      return (
        <group>
          {cap}
          <mesh position={[0, 0.02, 0.13]} castShadow>
            <boxGeometry args={[0.33, 0.3, 0.09]} />
            {m()}
          </mesh>
        </group>
      );
    case "long":
      return (
        <group>
          {cap}
          {[-0.185, 0.185].map((x) => (
            <mesh key={x} position={[x, -0.14, 0.0]} castShadow>
              <boxGeometry args={[0.06, 0.4, 0.32]} />
              {m()}
            </mesh>
          ))}
          <mesh position={[0, -0.11, 0.15]} castShadow>
            <boxGeometry args={[0.34, 0.5, 0.08]} />
            {m()}
          </mesh>
        </group>
      );
    case "afro":
      return (
        <mesh position={[0, 0.14, 0.01]} castShadow>
          <sphereGeometry args={[0.25, 12, 10]} />
          <meshStandardMaterial color={color} roughness={0.95} />
        </mesh>
      );
    case "curly":
      return (
        <group>
          <mesh position={[0, 0.15, 0.01]} castShadow>
            <sphereGeometry args={[0.215, 12, 10]} />
            <meshStandardMaterial color={color} roughness={0.95} />
          </mesh>
          {[-0.16, 0.16].map((x) => (
            <mesh key={x} position={[x, -0.02, 0.0]} castShadow>
              <sphereGeometry args={[0.1, 8, 8]} />
              <meshStandardMaterial color={color} roughness={0.95} />
            </mesh>
          ))}
        </group>
      );
    case "spiky":
      return (
        <group>
          {cap}
          {[-0.1, 0, 0.1].map((x) =>
            [-0.08, 0.08].map((z) => (
              <mesh key={`${x}_${z}`} position={[x, 0.23, z]} rotation={[0.15 * z, 0, 0.2 * x]} castShadow>
                <coneGeometry args={[0.05, 0.13, 4]} />
                {m()}
              </mesh>
            )),
          )}
        </group>
      );
    case "medium":
    default:
      return (
        <group>
          {cap}
          <mesh position={[0, -0.02, 0.14]} castShadow>
            <boxGeometry args={[0.34, 0.36, 0.09]} />
            {m()}
          </mesh>
          {[-0.185, 0.185].map((x) => (
            <mesh key={x} position={[x, 0.0, 0.02]} castShadow>
              <boxGeometry args={[0.06, 0.24, 0.3]} />
              {m()}
            </mesh>
          ))}
        </group>
      );
  }
}

export default function PixelPerson({ skin: s, status }: Props) {
  const rootRef = useRef<THREE.Group>(null);
  const upperRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const lArm = useRef<THREE.Group>(null);
  const rArm = useRef<THREE.Group>(null);
  const t = useRef(Math.random() * 10);

  const cloth = (color: string) => <meshStandardMaterial color={color} roughness={0.85} />;
  const skinMat = <meshStandardMaterial color={s.skin} roughness={0.6} />;

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    t.current += dt;
    const tt = t.current;
    const working = status === "working" || status === "collab";
    const thinking = status === "thinking";
    const blocked = status === "blocked";
    const review = status === "review";

    // Yuqori tana engashishi
    let lean = 0.04;
    if (working) lean = 0.2 + Math.sin(tt * 9) * 0.012;
    else if (thinking) lean = -0.04;
    else if (review) lean = 0.12;
    if (upperRef.current) upperRef.current.rotation.x = damp(upperRef.current.rotation.x, lean, 6, dt);

    // Bosh
    let tilt = 0;
    let nod = 0;
    const bob = Math.sin(tt * (working ? 4 : 1.6)) * 0.02;
    if (thinking) { tilt = 0.2; nod = -0.06; }
    else if (working) nod = 0.2 + Math.sin(tt * 4.5) * 0.03;
    else if (review) nod = 0.14;
    else if (blocked) tilt = Math.sin(tt * 22) * 0.06;
    if (headRef.current) {
      headRef.current.rotation.z = damp(headRef.current.rotation.z, tilt, 6, dt);
      headRef.current.rotation.x = damp(headRef.current.rotation.x, nod + bob, 7, dt);
    }

    // Yozish — bilaklar (tirsakdan aylanadi)
    let lType = 0;
    let rType = 0;
    if (working) {
      lType = Math.max(0, Math.sin(tt * 11)) * 0.4;
      rType = Math.max(0, Math.sin(tt * 11 + 1.7)) * 0.4;
    }
    if (lArm.current) lArm.current.rotation.x = damp(lArm.current.rotation.x, -0.2 - lType, 12, dt);
    if (rArm.current) rArm.current.rotation.x = damp(rArm.current.rotation.x, -0.2 - rType, 12, dt);

    // Butun gavda chayqalish / titrash
    if (rootRef.current) {
      let sway = Math.sin(tt * 0.6) * 0.01;
      let shake = 0;
      if (blocked) { sway = Math.sin(tt * 20) * 0.02; shake = Math.sin(tt * 31) * 0.006; }
      else if (thinking) sway = Math.sin(tt * 0.9) * 0.025;
      rootRef.current.rotation.z = damp(rootRef.current.rotation.z, sway, 5, dt);
      rootRef.current.position.x = damp(rootRef.current.position.x, shake, 20, dt);
    }
  });

  return (
    <group ref={rootRef}>
      {/* ── Oyoqlar (o'tirgan: son oldinga, boldir pastga) ── */}
      {[-0.09, 0.09].map((x) => (
        <group key={x}>
          {/* son — gorizontal, oldinga (−z) */}
          <mesh position={[x, 0.49, -0.17]} castShadow>
            <boxGeometry args={[0.13, 0.13, 0.36]} />
            {cloth(s.bottom)}
          </mesh>
          {/* boldir — pastga */}
          <mesh position={[x, 0.29, -0.35]} castShadow>
            <boxGeometry args={[0.12, 0.42, 0.12]} />
            {cloth(s.bottom)}
          </mesh>
          {/* poyabzal */}
          <mesh position={[x, 0.06, -0.41]} castShadow>
            <boxGeometry args={[0.13, 0.1, 0.22]} />
            {cloth(s.shoes)}
          </mesh>
        </group>
      ))}

      {/* ── Tos ── */}
      <mesh position={[0, 0.55, -0.02]} castShadow>
        <boxGeometry args={[0.34, 0.16, 0.26]} />
        {cloth(s.bottom)}
      </mesh>

      {/* ── Yuqori tana (engashadi) ── */}
      <group ref={upperRef} position={[0, 0.6, -0.02]}>
        {/* torso */}
        <mesh position={[0, 0.18, 0]} castShadow>
          <boxGeometry args={[0.34, 0.38, 0.24]} />
          {cloth(s.top)}
        </mesh>

        {/* Yelka + qo'llar (tirsakdan yozish) */}
        {[-0.22, 0.22].map((x, i) => (
          <group key={x}>
            {/* yelka/elka */}
            <mesh position={[x, 0.26, 0]} castShadow>
              <boxGeometry args={[0.1, 0.26, 0.11]} />
              {cloth(s.top)}
            </mesh>
            {/* bilak (tirsak pivotида, oldinга) */}
            <group ref={i === 0 ? lArm : rArm} position={[x, 0.14, -0.02]} rotation={[-0.2, 0, 0]}>
              <mesh position={[0, 0, -0.16]} castShadow>
                <boxGeometry args={[0.09, 0.09, 0.28]} />
                {cloth(s.top)}
              </mesh>
              {/* kaft */}
              <mesh position={[0, -0.01, -0.32]} castShadow>
                <boxGeometry args={[0.09, 0.07, 0.09]} />
                {skinMat}
              </mesh>
            </group>
          </group>
        ))}

        {/* bo'yin */}
        <mesh position={[0, 0.4, 0]} castShadow>
          <boxGeometry args={[0.1, 0.07, 0.1]} />
          {skinMat}
        </mesh>

        {/* ── Bosh (qimirlaydi) ── */}
        <group ref={headRef} position={[0, 0.56, 0]}>
          {/* kalla */}
          <mesh castShadow>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            {skinMat}
          </mesh>
          {/* ko'zlar (old = −z) */}
          {[-0.07, 0.07].map((x) => (
            <mesh key={x} position={[x, 0.02, -0.153]}>
              <boxGeometry args={[0.045, 0.06, 0.02]} />
              <meshStandardMaterial color="#1a1a22" roughness={0.5} />
            </mesh>
          ))}
          <Hair style={s.hairStyle} color={s.hair} />
        </group>
      </group>

      {/* Holat halqasi (bosh ustida) */}
      <mesh position={[0, 1.5, -0.02]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.055, 0.095, 20]} />
        <meshBasicMaterial color={STATUS_COLOR[status]} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
