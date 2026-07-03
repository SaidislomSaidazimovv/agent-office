import { Html } from "@react-three/drei";
import type { AgentView } from "../store";
import { useOffice } from "../store";
import Character from "./Character";
import { presetFor, SEATS, STATUS_COLOR, STATUS_LABEL } from "./roles";

// ── Bitta ish joyi: stol + monitor + o'tirgan agent + yorliq ──

const DESK_TOP = 0.74;

export default function Workstation({ agent }: { agent: AgentView }) {
  const seat = SEATS[agent.seatIndex] ?? SEATS[0];
  const preset = presetFor(agent.role, agent.seatIndex);
  const select = useOffice((s) => s.select);
  const selected = useOffice((s) => s.selectedId === agent.id);
  const screenColor = STATUS_COLOR[agent.status];

  return (
    <group position={[seat.x, 0, seat.z]} rotation={[0, seat.ry, 0]} onClick={(e) => { e.stopPropagation(); select(agent.id); }}>
      {/* Stol */}
      <mesh position={[0, DESK_TOP, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.06, 0.8]} />
        <meshStandardMaterial color="#3a3f4a" roughness={0.7} />
      </mesh>
      {[-0.65, 0.65].map((x) => (
        <mesh key={x} position={[x, DESK_TOP / 2, 0]} castShadow>
          <boxGeometry args={[0.06, DESK_TOP, 0.7]} />
          <meshStandardMaterial color="#2a2e35" roughness={0.8} />
        </mesh>
      ))}

      {/* Monitor (agentга qaragan — old tomon +z) */}
      <group position={[0, DESK_TOP + 0.02, 0.28]}>
        <mesh position={[0, 0.22, 0]} castShadow>
          <boxGeometry args={[0.62, 0.38, 0.03]} />
          <meshStandardMaterial color="#15181d" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.22, 0.017]}>
          <planeGeometry args={[0.56, 0.32]} />
          <meshBasicMaterial color={screenColor} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.02, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.16, 8]} />
          <meshStandardMaterial color="#20242b" />
        </mesh>
      </group>

      {/* Klaviatura */}
      <mesh position={[0, DESK_TOP + 0.04, -0.12]} rotation={[-0.05, 0, 0]} castShadow>
        <boxGeometry args={[0.42, 0.02, 0.16]} />
        <meshStandardMaterial color="#1b1e24" roughness={0.6} />
      </mesh>

      {/* Agent — stolдан oldinга (−z) o'tiradi, ekranга qaraydi */}
      <group position={[0, 0, -0.55]} rotation={[0, Math.PI, 0]}>
        <Character colors={preset.colors} status={agent.status} />
      </group>

      {/* Kursi asosи */}
      <mesh position={[0, 0.02, -0.6]}>
        <cylinderGeometry args={[0.28, 0.3, 0.04, 16]} />
        <meshStandardMaterial color="#22262d" />
      </mesh>

      {/* Yorliq */}
      <Html position={[0, 1.95, 0]} center distanceFactor={9} occlude={false} style={{ pointerEvents: "none" }}>
        <div
          style={{
            padding: "3px 9px",
            borderRadius: 8,
            background: selected ? "rgba(94,155,255,0.9)" : "rgba(20,24,32,0.82)",
            border: `1px solid ${STATUS_COLOR[agent.status]}`,
            color: "#fff",
            fontFamily: "system-ui, sans-serif",
            fontSize: 12,
            whiteSpace: "nowrap",
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 600 }}>{agent.folderName}</div>
          <div style={{ fontSize: 10, opacity: 0.85 }}>
            <span style={{ color: STATUS_COLOR[agent.status] }}>●</span>{" "}
            {STATUS_LABEL[agent.status]}
            {agent.toolLabel ? ` · ${agent.toolLabel}` : ""}
          </div>
        </div>
      </Html>
    </group>
  );
}
