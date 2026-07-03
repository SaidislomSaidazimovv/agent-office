import { Html } from "@react-three/drei";
import { Suspense } from "react";
import type { AgentView } from "../store";
import { useOffice } from "../store";
import { Suspense as ReactSuspense } from "react";
import Prop, { ModelBoundary } from "../three/Prop";
import Character from "./Character";
import RiggedCharacter from "./RiggedCharacter";
import { presetFor, RIGGED_GLB, SEATS, STATUS_COLOR, STATUS_LABEL } from "./roles";

// Rigged GLB bo'lsa — o'tirgan skeletli personaj; bo'lmasa geometrik placeholder.
function SeatedAgent({ role, colors, status }: { role?: string; colors: { top: string; pants: string; skin: string }; status: AgentView["status"] }) {
  const url = role ? RIGGED_GLB[role] : undefined;
  if (!url) return <Character colors={colors} status={status} />;
  return (
    <ModelBoundary fallback={<Character colors={colors} status={status} />}>
      <ReactSuspense fallback={null}>
        <RiggedCharacter url={url} status={status} />
      </ReactSuspense>
    </ModelBoundary>
  );
}

// ── Bitta ish joyi: real GLB mebel + o'tirgan agent + yorliq ──

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
          <meshStandardMaterial color={preset.colors.top} roughness={0.35} />
        </mesh>
        <mesh position={[0.038, 0.045, 0]}>
          <torusGeometry args={[0.022, 0.006, 8, 16]} />
          <meshStandardMaterial color={preset.colors.top} roughness={0.35} />
        </mesh>
      </group>

      {/* O'tirgan agent — kreslода, monitorга (−z) qaragan */}
      <group position={[0, 0, 0.52]}>
        <SeatedAgent role={agent.role} colors={preset.colors} status={agent.status} />
      </group>

      {/* Yorliq */}
      <Html position={[0, 2.0, 0.3]} center distanceFactor={9} occlude={false} style={{ pointerEvents: "none" }}>
        <div
          style={{
            padding: "3px 9px",
            borderRadius: 8,
            background: selected ? "rgba(94,155,255,0.92)" : "rgba(16,20,27,0.86)",
            border: `1px solid ${screenColor}`,
            color: "#fff",
            fontFamily: "system-ui, sans-serif",
            fontSize: 12,
            whiteSpace: "nowrap",
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 600 }}>{agent.folderName}</div>
          <div style={{ fontSize: 10, opacity: 0.85 }}>
            <span style={{ color: screenColor }}>●</span> {STATUS_LABEL[agent.status]}
            {agent.toolLabel ? ` · ${agent.toolLabel}` : ""}
          </div>
        </div>
      </Html>
    </group>
  );
}
