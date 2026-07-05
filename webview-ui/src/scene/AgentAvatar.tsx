import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { AgentView } from "../store";
import { useOffice } from "../store";
import { slide } from "./collision";
import { nearestNode, pathBetween, randomNodeKey, type WP } from "./nav";
import PixelPerson from "./PixelPerson";
import { presetFor, seatFor, sitPoint, STATUS_COLOR, STATUS_LABEL, tokenBar } from "./roles";

// ── Agent personaji (dunyo darajasida, navigatsiya bilan) ────
// Ishlaganda stolda o'tiradi; bo'sh (idle) turganda ofis bo'ylab sayr
// qiladi — eshiklardan xonalarga kiradi (Pixel Agents kabi).

const SPEED = 1.7;

export default function AgentAvatar({ agent }: { agent: AgentView }) {
  const seat = seatFor(agent.seatIndex);
  const preset = presetFor(agent.role, agent.seatIndex);
  const select = useOffice((s) => s.select);
  const selected = useOffice((s) => s.selectedId === agent.id);
  const color = STATUS_COLOR[agent.status];
  const tok = tokenBar(agent.inputTokens, agent.contextWindow);

  // O'tirish nuqtasi (stul markazi — har qanday yo'nalishga mos, collision chetda)
  const sit = useRef<WP>({ ...sitPoint(seat) });

  const group = useRef<THREE.Group>(null);
  const pos = useRef<WP>({ ...sit.current });
  const path = useRef<WP[]>([]);
  const curNode = useRef(nearestNode(sit.current.x, sit.current.z)); // joriy graf tuguni
  const pendingNode = useRef<string | null>(null);
  const pause = useRef(0);
  const seated = useRef(true);
  const movingRef = useRef(false);
  const prevDesired = useRef(true);
  const stuck = useRef(0);
  const statusRef = useRef(agent.status);
  statusRef.current = agent.status;

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const g = group.current;
    if (!g) return;
    const desiredSit = statusRef.current !== "idle";
    const p = pos.current;

    // Rejim o'zgarsa — joriy tugunga yetib qayta rejalaymiz (uzoq aylanmasin)
    if (desiredSit !== prevDesired.current) {
      prevDesired.current = desiredSit;
      if (path.current.length > 1) {
        path.current = path.current.slice(0, 1);
        pendingNode.current = null;
      }
    }

    // Yo'l tugagan — keyingi maqsad. HAR DOIM graf tugunidan (curNode) yo'l
    // olamiz → yo'llar faqat eshiklardan o'tadi, devor/mebeldan emas.
    if (path.current.length === 0) {
      const atSeat = Math.hypot(p.x - sit.current.x, p.z - sit.current.z) < 0.25;
      if (desiredSit) {
        if (atSeat) {
          seated.current = true;
        } else {
          const target = nearestNode(sit.current.x, sit.current.z);
          path.current = [...pathBetween(curNode.current, target), sit.current];
          pendingNode.current = target;
        }
      } else {
        seated.current = false;
        if (pause.current > 0) {
          pause.current -= dt;
        } else {
          const target = randomNodeKey();
          path.current = pathBetween(curNode.current, target);
          pendingNode.current = target;
        }
      }
    }

    // Harakat — faqat yo'l nuqtalari orasida (graf qirralari devor kesmaydi)
    let moving = false;
    if (path.current.length > 0) {
      seated.current = false;
      const t = path.current[0];
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.1) {
        p.x = t.x;
        p.z = t.z;
        path.current.shift();
        if (path.current.length === 0) {
          curNode.current = pendingNode.current ?? nearestNode(p.x, p.z);
          pendingNode.current = null;
          if (!desiredSit) pause.current = 1.5 + Math.random() * 4;
        }
      } else {
        // QATTIQ to'qnashuv — devor/mebeldan o'tmaydi, sirg'anadi
        const mvx = (dx / dist) * SPEED * dt;
        const mvz = (dz / dist) * SPEED * dt;
        const res = slide(p.x, p.z, mvx, mvz, 0.16);
        const moved = Math.hypot(res.x - p.x, res.z - p.z);
        p.x = res.x;
        p.z = res.z;
        moving = true;
        g.rotation.y = dampAngle(g.rotation.y, Math.atan2(-dx, -dz), 10, dt);
        // Tiqilib qolsa — bu nuqtani tashlab, qayta rejalaymiz
        if (moved < SPEED * dt * 0.25) {
          stuck.current += dt;
          if (stuck.current > 0.8) {
            path.current.shift();
            stuck.current = 0;
            if (path.current.length === 0) {
              curNode.current = pendingNode.current ?? nearestNode(p.x, p.z);
              pendingNode.current = null;
              if (!desiredSit) pause.current = 1 + Math.random() * 3;
            }
          }
        } else {
          stuck.current = 0;
        }
      }
    }
    movingRef.current = moving;

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

      {/* Sub-agentlar — yonida kichik personaj */}
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
          <div style={{ padding: "4px 10px", borderRadius: 12, background: "#ff9f0a", color: "#1a1300", fontFamily: "system-ui", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>🔔 Ruxsat so'raldi</div>
        </Html>
      )}

      {/* Yorliq — tanlanganda to'liq, aks holda IXCHAM (ko'p agentda ustma-ust
          bo'lmasin: faqat nuqta + nom). */}
      <Html position={[0, 1.98, 0]} center occlude={false} style={{ pointerEvents: "none" }} zIndexRange={selected ? [100, 0] : [10, 0]}>
        {selected ? (
          <div style={{ padding: "3px 9px 5px", borderRadius: 8, minWidth: 92, background: "rgba(94,155,255,0.92)", border: `1px solid ${color}`, color: "#fff", fontFamily: "system-ui", fontSize: 12, whiteSpace: "nowrap", textAlign: "center" }}>
            <div style={{ fontWeight: 600 }}>{agent.folderName}</div>
            <div style={{ fontSize: 10, opacity: 0.85 }}><span style={{ color }}>●</span> {STATUS_LABEL[agent.status]}{agent.toolLabel ? ` · ${agent.toolLabel}` : ""}</div>
            {agent.inputTokens > 0 && (
              <div style={{ marginTop: 3, height: 4, borderRadius: 3, background: "rgba(255,255,255,0.16)", overflow: "hidden" }}>
                <div style={{ width: `${Math.max(4, tok.pct * 100)}%`, height: "100%", background: tok.color }} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 11, background: "rgba(16,20,27,0.82)", border: `1px solid ${color}`, color: "#fff", fontFamily: "system-ui", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
            {agent.folderName}
          </div>
        )}
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
