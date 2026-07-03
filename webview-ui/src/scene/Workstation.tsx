import type { AgentView } from "../store";
import { useOffice } from "../store";
import { SEATS, STATUS_COLOR } from "./roles";

// ── Agent ish joyi — MEBEL (personaj AgentAvatar'да, alohida) ──

const DESK_TOP = 0.72;
const WOOD = "#8a6f52";
const WOOD_DARK = "#6d5741";

export default function Workstation({ agent }: { agent: AgentView }) {
  const seat = SEATS[agent.seatIndex] ?? SEATS[0];
  const select = useOffice((s) => s.select);
  const color = STATUS_COLOR[agent.status];

  return (
    <group position={[seat.x, 0, seat.z]} rotation={[0, seat.ry, 0]} onClick={(e) => { e.stopPropagation(); select(agent.id); }}>
      {/* Stol usti */}
      <mesh position={[0, DESK_TOP, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.08, 0.8]} />
        <meshStandardMaterial color={WOOD} roughness={0.85} />
      </mesh>
      {[-0.68, 0.68].map((x) => (
        <mesh key={x} position={[x, DESK_TOP / 2, 0]} castShadow>
          <boxGeometry args={[0.08, DESK_TOP, 0.72]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
        </mesh>
      ))}

      {/* Monitor — ekran holat rangida */}
      <group position={[0, DESK_TOP + 0.04, -0.22]}>
        <mesh position={[0, 0.24, 0]} castShadow>
          <boxGeometry args={[0.66, 0.42, 0.05]} />
          <meshStandardMaterial color="#1a1d22" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.24, -0.03]}>
          <planeGeometry args={[0.58, 0.34]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.03, 0]} castShadow>
          <boxGeometry args={[0.08, 0.14, 0.08]} />
          <meshStandardMaterial color="#23262b" />
        </mesh>
      </group>

      {/* Klaviatura + krujka */}
      <mesh position={[0, DESK_TOP + 0.05, 0.14]} castShadow>
        <boxGeometry args={[0.5, 0.03, 0.18]} />
        <meshStandardMaterial color="#2a2e35" roughness={0.7} />
      </mesh>
      <mesh position={[0.55, DESK_TOP + 0.09, 0.05]} castShadow>
        <cylinderGeometry args={[0.05, 0.045, 0.1, 10]} />
        <meshStandardMaterial color="#c0653c" roughness={0.5} />
      </mesh>

      {/* Kursi */}
      <group position={[0, 0, 0.62]}>
        <mesh position={[0, 0.46, 0]} castShadow>
          <boxGeometry args={[0.5, 0.08, 0.5]} />
          <meshStandardMaterial color="#3a3f48" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.75, 0.24]} castShadow>
          <boxGeometry args={[0.5, 0.5, 0.08]} />
          <meshStandardMaterial color="#3a3f48" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.05, 0.06, 0.44, 8]} />
          <meshStandardMaterial color="#555b66" metalness={0.5} />
        </mesh>
      </group>
    </group>
  );
}
