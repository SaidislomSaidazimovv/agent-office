import type { AgentView } from "../store";
import { useOffice } from "../store";
import { SEATS, STATUS_COLOR } from "./roles";

// ── Agent ish joyi — MEBEL (personaj AgentAvatar'да, alohida) ──

const DESK_TOP = 0.72;
const DESKTOP_C = "#f2efe9"; // oq stol usti
const STEEL = "#8b929c"; // chrome oyoq

export default function Workstation({ agent }: { agent: AgentView }) {
  const seat = SEATS[agent.seatIndex] ?? SEATS[0];
  const select = useOffice((s) => s.select);
  const color = STATUS_COLOR[agent.status];

  return (
    <group position={[seat.x, 0, seat.z]} rotation={[0, seat.ry, 0]} onClick={(e) => { e.stopPropagation(); select(agent.id); }}>
      {/* Stol usti — oq + qora akцент qirra */}
      <mesh position={[0, DESK_TOP, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.06, 0.8]} />
        <meshStandardMaterial color={DESKTOP_C} roughness={0.4} />
      </mesh>
      <mesh position={[0, DESK_TOP - 0.045, 0]}>
        <boxGeometry args={[1.52, 0.03, 0.82]} />
        <meshStandardMaterial color="#2a2e35" roughness={0.4} />
      </mesh>
      {/* nozik chrome A-oyoqlar */}
      {[-0.64, 0.64].map((x) => (
        <mesh key={x} position={[x, DESK_TOP / 2 - 0.03, 0]} castShadow>
          <boxGeometry args={[0.05, DESK_TOP - 0.06, 0.68]} />
          <meshStandardMaterial color="#4a4f57" roughness={0.4} metalness={0.6} />
        </mesh>
      ))}

      {/* Slim monitor — ekran holat rangida */}
      <group position={[0, DESK_TOP + 0.02, -0.22]}>
        <mesh position={[0, 0.26, 0]} castShadow>
          <boxGeometry args={[0.7, 0.42, 0.03]} />
          <meshStandardMaterial color="#12151a" roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.26, -0.02]}>
          <planeGeometry args={[0.64, 0.36]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        {/* nozik stend */}
        <mesh position={[0, 0.05, 0]} castShadow>
          <boxGeometry args={[0.05, 0.16, 0.05]} />
          <meshStandardMaterial color="#3a3f47" />
        </mesh>
        <mesh position={[0, -0.02, 0]}>
          <boxGeometry args={[0.26, 0.02, 0.14]} />
          <meshStandardMaterial color="#2a2e35" />
        </mesh>
      </group>

      {/* Klaviatura + krujka */}
      <mesh position={[0, DESK_TOP + 0.04, 0.14]} castShadow>
        <boxGeometry args={[0.5, 0.02, 0.16]} />
        <meshStandardMaterial color="#e2e2e0" roughness={0.6} />
      </mesh>
      <mesh position={[0.55, DESK_TOP + 0.08, 0.05]} castShadow>
        <cylinderGeometry args={[0.05, 0.045, 0.1, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
      </mesh>

      {/* Zamonaviy ergonomik kursi (5-yulduzli baza) */}
      <group position={[0, 0, 0.62]}>
        <mesh position={[0, 0.46, 0]} castShadow>
          <boxGeometry args={[0.48, 0.07, 0.48]} />
          <meshStandardMaterial color="#2c313a" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.74, 0.22]} castShadow>
          <boxGeometry args={[0.46, 0.5, 0.06]} />
          <meshStandardMaterial color="#2c313a" roughness={0.6} />
        </mesh>
        {/* qo'l tayanchlar */}
        {[-0.26, 0.26].map((x) => (
          <mesh key={x} position={[x, 0.56, 0.05]}><boxGeometry args={[0.05, 0.04, 0.3]} /><meshStandardMaterial color="#1c2027" /></mesh>
        ))}
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.04, 0.05, 0.44, 10]} />
          <meshStandardMaterial color={STEEL} roughness={0.35} metalness={0.85} />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => { const a = (i / 5) * Math.PI * 2; return <mesh key={i} position={[Math.cos(a) * 0.22, 0.04, Math.sin(a) * 0.22]} castShadow><boxGeometry args={[0.22, 0.04, 0.05]} /><meshStandardMaterial color="#3a3f47" metalness={0.6} roughness={0.4} /></mesh>; })}
      </group>
    </group>
  );
}
