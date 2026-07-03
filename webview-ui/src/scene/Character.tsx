import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { AgentStatus } from "../store";
import { STATUS_COLOR } from "./roles";

// ── Animatsiyali o'tirgan personaj (geometriyadan) ───────────
// GLB modellar keyingi bosqichда ulanadi; hozir bu proven placeholder
// holatga qarab jonli harakatlanadi (yozish, o'ylash, asabiylashish).

interface Props {
  colors: { top: string; pants: string; skin: string };
  status: AgentStatus;
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export default function Character({ colors: c, status }: Props) {
  const rootRef = useRef<THREE.Group>(null);
  const upperRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const lForearm = useRef<THREE.Group>(null);
  const rForearm = useRef<THREE.Group>(null);
  const t = useRef(Math.random() * 10);

  const hairColor = useMemo(() => {
    const col = new THREE.Color(c.top);
    col.offsetHSL(0, 0.05, -0.22);
    return `#${col.getHexString()}`;
  }, [c.top]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    t.current += dt;
    const tt = t.current;

    const working = status === "working" || status === "collab";
    const thinking = status === "thinking";
    const blocked = status === "blocked";
    const review = status === "review";

    const breatheSpeed = working ? 4.2 : blocked ? 5.5 : 1.6;
    const breathe = Math.sin(tt * breatheSpeed) * (working ? 0.012 : 0.02);

    let leanX = 0.05;
    if (working) leanX = 0.26 + Math.sin(tt * 9) * 0.015;
    else if (thinking) leanX = -0.02;
    else if (review) leanX = 0.14;
    if (upperRef.current) {
      upperRef.current.rotation.x = damp(upperRef.current.rotation.x, leanX, 6, dt);
      upperRef.current.scale.y = damp(upperRef.current.scale.y, 1 + breathe, 8, dt);
    }

    let headTilt = 0;
    let headNod = 0;
    const bob = Math.sin(tt * breatheSpeed + 0.4) * 0.02;
    if (thinking) { headTilt = 0.22; headNod = -0.08; }
    else if (working) { headNod = 0.22 + Math.sin(tt * 4.5) * 0.03; }
    else if (review) { headNod = 0.16; }
    else if (blocked) { headTilt = Math.sin(tt * 22) * 0.06; }
    if (headRef.current) {
      headRef.current.rotation.z = damp(headRef.current.rotation.z, headTilt, 6, dt);
      headRef.current.rotation.x = damp(headRef.current.rotation.x, headNod + bob, 7, dt);
    }

    let lType = 0, rType = 0;
    if (working) {
      lType = Math.max(0, Math.sin(tt * 11)) * 0.16;
      rType = Math.max(0, Math.sin(tt * 11 + 1.7)) * 0.16;
    }
    if (lForearm.current) lForearm.current.rotation.x = damp(lForearm.current.rotation.x, -lType, 12, dt);
    if (rForearm.current) rForearm.current.rotation.x = damp(rForearm.current.rotation.x, -rType, 12, dt);

    if (rootRef.current) {
      let swayZ = Math.sin(tt * 0.6) * 0.015;
      let shakeX = 0;
      if (blocked) { swayZ = Math.sin(tt * 20) * 0.02; shakeX = Math.sin(tt * 31) * 0.006; }
      else if (thinking) { swayZ = Math.sin(tt * 0.9) * 0.03; }
      rootRef.current.rotation.z = damp(rootRef.current.rotation.z, swayZ, 5, dt);
      rootRef.current.position.x = damp(rootRef.current.position.x, shakeX, 20, dt);
    }
  });

  const arm = (x: number, fref: React.RefObject<THREE.Group>) => (
    <group position={[x, 0.36, 0.0]}>
      <mesh position={[x > 0 ? 0.02 : -0.02, -0.16, -0.03]} rotation={[0.5, 0, x > 0 ? -0.12 : 0.12]} castShadow>
        <cylinderGeometry args={[0.055, 0.05, 0.28, 8]} />
        <meshStandardMaterial color={c.top} roughness={0.85} />
      </mesh>
      <group ref={fref} position={[x > 0 ? 0.05 : -0.05, -0.3, -0.1]}>
        <mesh position={[0, 0, -0.13]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.05, 0.26, 8]} />
          <meshStandardMaterial color={c.top} roughness={0.85} />
        </mesh>
        <mesh position={[0, -0.01, -0.27]} castShadow>
          <sphereGeometry args={[0.05, 10, 8]} />
          <meshStandardMaterial color={c.skin} roughness={0.6} />
        </mesh>
      </group>
    </group>
  );

  return (
    <group ref={rootRef}>
      {[-0.09, 0.09].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.5, -0.2]} rotation={[Math.PI / 2 - 0.12, 0, 0]} castShadow>
            <cylinderGeometry args={[0.062, 0.058, 0.38, 10]} />
            <meshStandardMaterial color={c.pants} roughness={0.92} />
          </mesh>
          <mesh position={[x, 0.28, -0.39]} rotation={[0.05, 0, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.045, 0.46, 10]} />
            <meshStandardMaterial color={c.pants} roughness={0.92} />
          </mesh>
          <mesh position={[x, 0.055, -0.42]} castShadow>
            <boxGeometry args={[0.09, 0.06, 0.16]} />
            <meshStandardMaterial color={hairColor} roughness={0.8} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, 0.58, -0.02]} castShadow>
        <boxGeometry args={[0.34, 0.18, 0.28]} />
        <meshStandardMaterial color={c.pants} roughness={0.92} />
      </mesh>

      <group ref={upperRef} position={[0, 0.62, 0]}>
        <mesh position={[0, 0.22, 0.0]} castShadow>
          <cylinderGeometry args={[0.15, 0.19, 0.46, 14]} />
          <meshStandardMaterial color={c.top} roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.4, 0.0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <capsuleGeometry args={[0.09, 0.26, 4, 12]} />
          <meshStandardMaterial color={c.top} roughness={0.85} />
        </mesh>

        {arm(-0.17, lForearm)}
        {arm(0.17, rForearm)}

        <mesh position={[0, 0.52, -0.01]} castShadow>
          <cylinderGeometry args={[0.05, 0.06, 0.09, 10]} />
          <meshStandardMaterial color={c.skin} roughness={0.6} />
        </mesh>

        <group ref={headRef} position={[0, 0.62, -0.01]}>
          <mesh castShadow>
            <sphereGeometry args={[0.115, 18, 16]} />
            <meshStandardMaterial color={c.skin} roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.03, 0.01]} scale={[1.04, 0.9, 1.04]} castShadow>
            <sphereGeometry args={[0.118, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            <meshStandardMaterial color={hairColor} roughness={0.9} />
          </mesh>
        </group>
      </group>

      {/* Holat indikatori — bosh ustida rangli disk */}
      <mesh position={[0, 1.62, -0.01]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.05, 0.09, 20]} />
        <meshBasicMaterial color={STATUS_COLOR[status]} transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
