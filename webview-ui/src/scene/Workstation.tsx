import { Html } from "@react-three/drei";
import type { AgentView } from "../store";
import { useOffice } from "../store";
import PixelPerson from "./PixelPerson";
import { presetFor, SEATS, STATUS_COLOR, STATUS_LABEL, tokenBar } from "./roles";

// ── Bitta ish joyi: yengil low-poly stol + voxel personaj + yorliq ──
// Og'ir GLB yo'q — sof geometriya (tez). Namunадеk flat uslub.

const DESK_TOP = 0.72;
const WOOD = "#8a6f52";
const WOOD_DARK = "#6d5741";

export default function Workstation({ agent }: { agent: AgentView }) {
  const seat = SEATS[agent.seatIndex] ?? SEATS[0];
  const preset = presetFor(agent.role, agent.seatIndex);
  const select = useOffice((s) => s.select);
  const selected = useOffice((s) => s.selectedId === agent.id);
  const color = STATUS_COLOR[agent.status];
  const tok = tokenBar(agent.inputTokens);

  return (
    <group
      position={[seat.x, 0, seat.z]}
      rotation={[0, seat.ry, 0]}
      onClick={(e) => {
        e.stopPropagation();
        select(agent.id);
      }}
    >
      {/* Stol usti */}
      <mesh position={[0, DESK_TOP, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.08, 0.8]} />
        <meshStandardMaterial color={WOOD} roughness={0.85} />
      </mesh>
      {/* Yon panellar */}
      {[-0.68, 0.68].map((x) => (
        <mesh key={x} position={[x, DESK_TOP / 2, 0]} castShadow>
          <boxGeometry args={[0.08, DESK_TOP, 0.72]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
        </mesh>
      ))}

      {/* Monitor — ekran holat rangida (−z, personajга qaragan) */}
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

      {/* Klaviatura */}
      <mesh position={[0, DESK_TOP + 0.05, 0.14]} castShadow>
        <boxGeometry args={[0.5, 0.03, 0.18]} />
        <meshStandardMaterial color="#2a2e35" roughness={0.7} />
      </mesh>

      {/* Kursi (sodda) */}
      <group position={[0, 0, 0.62]}>
        <mesh position={[0, 0.46, 0]} castShadow>
          <boxGeometry args={[0.5, 0.08, 0.5]} />
          <meshStandardMaterial color="#3a3f48" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.75, 0.24]} castShadow>
          <boxGeometry args={[0.5, 0.5, 0.08]} />
          <meshStandardMaterial color="#3a3f48" roughness={0.9} />
        </mesh>
      </group>

      {/* Voxel personaj — kreslода, monitorга (−z) qaragan */}
      <group position={[0, 0, 0.56]}>
        <PixelPerson skin={preset} status={agent.status} />
      </group>

      {/* Ruxsat pufagi */}
      {agent.permission && (
        <Html position={[0, 2.4, 0.3]} center style={{ pointerEvents: "none" }}>
          <div style={{ padding: "4px 10px", borderRadius: 12, background: "#ff9f0a", color: "#1a1300", fontFamily: "system-ui", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
            🔔 Ruxsat so'ralди
          </div>
        </Html>
      )}

      {/* Yorliq + token-bar */}
      <Html position={[0, 2.0, 0.3]} center occlude={false} style={{ pointerEvents: "none" }}>
        <div style={{ padding: "3px 9px 5px", borderRadius: 8, minWidth: 96, background: selected ? "rgba(94,155,255,0.92)" : "rgba(16,20,27,0.86)", border: `1px solid ${color}`, color: "#fff", fontFamily: "system-ui", fontSize: 12, whiteSpace: "nowrap", textAlign: "center" }}>
          <div style={{ fontWeight: 600 }}>{agent.folderName}</div>
          <div style={{ fontSize: 10, opacity: 0.85 }}>
            <span style={{ color }}>●</span> {STATUS_LABEL[agent.status]}
            {agent.toolLabel ? ` · ${agent.toolLabel}` : ""}
          </div>
          {agent.inputTokens > 0 && (
            <div style={{ marginTop: 3, height: 4, borderRadius: 3, background: "rgba(255,255,255,0.16)", overflow: "hidden" }}>
              <div style={{ width: `${Math.max(4, tok.pct * 100)}%`, height: "100%", background: tok.color }} />
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}
