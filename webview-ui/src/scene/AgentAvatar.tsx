import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { AgentView } from "../store";
import { useOffice } from "../store";
import { nearestNode, pathBetween, randomNodeKey, type WP } from "./nav";
import PixelPerson from "./PixelPerson";
import { presetFor, SEATS, STATUS_COLOR, STATUS_LABEL, tokenBar } from "./roles";

// ── Agent personaji (dunyo darajасида, navigatsiya bilan) ────
// Ishlaganда stolда o'tiradi; bo'sh (idle) turганda ofis bo'ylab sayr
// qiladi — eshiklardан xonаларга kiradi (Pixel Agents kabi).

const SPEED = 1.7;

export default function AgentAvatar({ agent }: { agent: AgentView }) {
  const seat = SEATS[agent.seatIndex] ?? SEATS[0];
  const preset = presetFor(agent.role, agent.seatIndex);
  const select = useOffice((s) => s.select);
  const selected = useOffice((s) => s.selectedId === agent.id);
  const color = STATUS_COLOR[agent.status];
  const tok = tokenBar(agent.inputTokens);

  // O'tirish nuqtasi + yo'nalishи (stol oldida)
  const sit = useRef<WP>({ x: seat.x + (seat.ry > 0 ? 0.56 : -0.56), z: seat.z });

  const group = useRef<THREE.Group>(null);
  const pos = useRef<WP>({ ...sit.current });
  const path = useRef<WP[]>([]);
  const pause = useRef(0);
  const seated = useRef(true);
  const movingRef = useRef(false);
  const statusRef = useRef(agent.status);
  statusRef.current = agent.status;

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const g = group.current;
    if (!g) return;
    const desiredSit = statusRef.current !== "idle";
    const p = pos.current;

    // Yo'l tugagan bo'lsa — keyingi maqsad
    if (path.current.length === 0) {
      const atSeat = Math.hypot(p.x - sit.current.x, p.z - sit.current.z) < 0.2;
      if (desiredSit) {
        if (!atSeat) {
          path.current = [...pathBetween(nearestNode(p.x, p.z), nearestNode(sit.current.x, sit.current.z)), sit.current];
        } else {
          seated.current = true;
        }
      } else {
        seated.current = false;
        if (pause.current > 0) {
          pause.current -= dt;
        } else {
          path.current = pathBetween(nearestNode(p.x, p.z), randomNodeKey());
        }
      }
    }

    // Harakat
    let moving = false;
    if (path.current.length > 0) {
      seated.current = false;
      const target = path.current[0];
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.12) {
        p.x = target.x;
        p.z = target.z;
        path.current.shift();
        if (path.current.length === 0 && !desiredSit) pause.current = 1 + Math.random() * 4;
      } else {
        p.x += (dx / dist) * SPEED * dt;
        p.z += (dz / dist) * SPEED * dt;
        moving = true;
        const yaw = Math.atan2(-dx, -dz);
        g.rotation.y = dampAngle(g.rotation.y, yaw, 10, dt);
      }
    }
    movingRef.current = moving;

    // O'tirganда stol tomon qaraydi
    if (seated.current) g.rotation.y = dampAngle(g.rotation.y, seat.ry, 8, dt);

    g.position.x = p.x;
    g.position.z = p.z;
  });

  return (
    <group ref={group} position={[sit.current.x, 0, sit.current.z]} onClick={(e) => { e.stopPropagation(); select(agent.id); }}>
      <PixelPerson
        skin={preset}
        status={agent.status}
        getState={() => ({ sit: seated.current, moving: movingRef.current })}
      />

      {/* Sub-agentlar — yonида kichik personaj */}
      {agent.subagents.map((key, i) => (
        <group key={key} position={[0.9 + (i % 2) * 0.7, 0, 0.4 - Math.floor(i / 2) * 0.7]} scale={0.55}>
          <PixelPerson skin={preset} status="working" pose="stand" />
          <Html position={[0, 1.9, 0]} center style={{ pointerEvents: "none" }}>
            <div style={{ padding: "2px 6px", borderRadius: 7, background: "rgba(255,214,10,0.92)", color: "#1a1500", fontFamily: "system-ui", fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" }}>🔧 Sub</div>
          </Html>
        </group>
      ))}

      {/* Ruxsat pufagi */}
      {agent.permission && (
        <Html position={[0, 2.35, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{ padding: "4px 10px", borderRadius: 12, background: "#ff9f0a", color: "#1a1300", fontFamily: "system-ui", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>🔔 Ruxsat so'ralди</div>
        </Html>
      )}

      {/* Yorliq (personaj bilan yuradi) */}
      <Html position={[0, 1.98, 0]} center occlude={false} style={{ pointerEvents: "none" }}>
        <div style={{ padding: "3px 9px 5px", borderRadius: 8, minWidth: 92, background: selected ? "rgba(94,155,255,0.92)" : "rgba(16,20,27,0.86)", border: `1px solid ${color}`, color: "#fff", fontFamily: "system-ui", fontSize: 12, whiteSpace: "nowrap", textAlign: "center" }}>
          <div style={{ fontWeight: 600 }}>{agent.folderName}</div>
          <div style={{ fontSize: 10, opacity: 0.85 }}><span style={{ color }}>●</span> {STATUS_LABEL[agent.status]}{agent.toolLabel ? ` · ${agent.toolLabel}` : ""}</div>
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

function dampAngle(cur: number, target: number, l: number, dt: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * (1 - Math.exp(-l * dt));
}
