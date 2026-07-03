import { Html } from "@react-three/drei";
import { Suspense } from "react";
import type { AgentView } from "../store";
import { useOffice } from "../store";
import Prop, { ModelBoundary } from "../three/Prop";
import PixelPerson from "./PixelPerson";
import { presetFor, SEATS, STATUS_COLOR, STATUS_LABEL, tokenBar } from "./roles";

// ── Bitta ish joyi: real GLB mebel + o'tirgan voxel personaj + yorliq ──

const DESK_TOP = 0.74;
const M = {
  table: "/models/cyberpunk_table.glb",
  chair: "/models/chair-opt.glb",
  monitor: "/models/monitor-opt.glb",
  keyboard: "/models/hyperx_gaming_keyboard_low_poly.glb",
  mouse: "/models/pc_mouse_type-r.glb",
  pc: "/models/pc-opt.glb",
};

export default function Workstation({ agent }: { agent: AgentView }) {
  const seat = SEATS[agent.seatIndex] ?? SEATS[0];
  const preset = presetFor(agent.role, agent.seatIndex);
  const select = useOffice((s) => s.select);
  const selected = useOffice((s) => s.selectedId === agent.id);
  const screenColor = STATUS_COLOR[agent.status];
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
      {/* Real jihozlar — auto-fit Prop */}
      <ModelBoundary>
        <Suspense fallback={null}>
          <Prop url={M.table} fit={0.74} fitAxis="height" position={[0, 0, 0]} />
          <Prop url={M.chair} fit={1.05} fitAxis="height" position={[0, 0, 0.72]} rotation={[0, Math.PI, 0]} />
          <Prop url={M.monitor} fit={0.42} fitAxis="height" position={[0, DESK_TOP, -0.2]} rotation={[0, -Math.PI / 2, 0]} />
          <Prop url={M.keyboard} fit={0.44} fitAxis="width" position={[-0.02, DESK_TOP + 0.01, 0.16]} />
          <Prop url={M.mouse} fit={0.11} fitAxis="width" position={[0.3, DESK_TOP + 0.01, 0.18]} />
          <Prop url={M.pc} fit={0.38} fitAxis="height" position={[0.62, DESK_TOP, -0.12]} rotation={[0, Math.PI / 2, 0]} />
        </Suspense>
      </ModelBoundary>

      {/* Holat ekrani — monitorга yopishtirilgan rangli porlash */}
      <mesh position={[0, DESK_TOP + 0.21, -0.16]}>
        <planeGeometry args={[0.48, 0.28]} />
        <meshBasicMaterial color={screenColor} toneMapped={false} transparent opacity={0.92} />
      </mesh>

      {/* Krujka detali */}
      <group position={[-0.66, DESK_TOP + 0.005, 0.08]}>
        <mesh position={[0, 0.042, 0]} castShadow>
          <cylinderGeometry args={[0.033, 0.028, 0.085, 14]} />
          <meshStandardMaterial color={preset.top} roughness={0.35} />
        </mesh>
        <mesh position={[0.038, 0.045, 0]}>
          <torusGeometry args={[0.022, 0.006, 8, 16]} />
          <meshStandardMaterial color={preset.top} roughness={0.35} />
        </mesh>
      </group>

      {/* O'tirgan voxel personaj — kreslода, monitorга (−z) qaragan */}
      <group position={[0, 0, 0.56]}>
        <PixelPerson skin={preset} status={agent.status} />
      </group>

      {/* Ruxsat pufagi (boshда, amber) */}
      {agent.permission && (
        <Html position={[0, 2.42, 0.3]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
          <div
            style={{
              padding: "4px 10px", borderRadius: 12, background: "#ff9f0a", color: "#1a1300",
              fontFamily: "system-ui, sans-serif", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            }}
          >
            🔔 Ruxsat so'ralди
          </div>
        </Html>
      )}

      {/* Yorliq — nom + holat + token-bar */}
      <Html position={[0, 2.0, 0.3]} center distanceFactor={9} occlude={false} style={{ pointerEvents: "none" }}>
        <div
          style={{
            padding: "3px 9px 5px", borderRadius: 8, minWidth: 96,
            background: selected ? "rgba(94,155,255,0.92)" : "rgba(16,20,27,0.86)",
            border: `1px solid ${screenColor}`,
            color: "#fff", fontFamily: "system-ui, sans-serif", fontSize: 12,
            whiteSpace: "nowrap", textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 600 }}>{agent.folderName}</div>
          <div style={{ fontSize: 10, opacity: 0.85 }}>
            <span style={{ color: screenColor }}>●</span> {STATUS_LABEL[agent.status]}
            {agent.toolLabel ? ` · ${agent.toolLabel}` : ""}
          </div>
          {/* Token health-bar */}
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
