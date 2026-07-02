import React, { useMemo, useRef } from "react";
import { Text, Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { STATUS } from "../config.js";
import { useSim } from "../state/simulation.js";
import AgentCharacter from "./AgentCharacter.jsx";
import * as THREE from "three";

function screenTexture(kind) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 160;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#12161c"; ctx.fillRect(0, 0, 256, 160);
  if (kind === "code") {
    ctx.fillStyle = "#0b0e13"; ctx.fillRect(0, 0, 46, 160);
    const cols = ["#79c0ff", "#7ee787", "#ffa657", "#d2a8ff"];
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = "#4a5261"; ctx.fillRect(14, 14 + i * 14, 16, 5);
      ctx.fillStyle = cols[i % 4];
      ctx.fillRect(56 + (i % 4) * 10, 14 + i * 14, 50 + Math.random() * 110, 5);
    }
  } else if (kind === "design") {
    ctx.fillStyle = "#1d2330"; ctx.fillRect(10, 10, 172, 140);
    ctx.fillStyle = "#5b4d8f"; ctx.fillRect(20, 20, 152, 32);
    ctx.fillStyle = "#2c3a54"; ctx.fillRect(20, 60, 70, 70);
    ctx.fillStyle = "#33cf66"; ctx.fillRect(100, 60, 72, 28);
    ctx.fillStyle = "#262b35"; ctx.fillRect(190, 10, 56, 140);
  } else if (kind === "doc") {
    ctx.fillStyle = "#ecebe6"; ctx.fillRect(34, 10, 188, 140);
    ctx.fillStyle = "#3a3a3a"; ctx.fillRect(46, 20, 90, 9);
    ctx.fillStyle = "#666";
    for (let i = 0; i < 8; i++) ctx.fillRect(46, 40 + i * 13, 110 + Math.random() * 50, 4);
  } else if (kind === "tests") {
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = Math.random() > 0.22 ? "#2ea043" : "#f85149";
      ctx.beginPath(); ctx.arc(20, 30 + i * 18, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#79828f";
      ctx.fillRect(34, 26 + i * 18, 80 + Math.random() * 100, 5);
    }
  } else {
    ctx.strokeStyle = "#3d7dd6"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(14, 120);
    for (let x = 14; x < 244; x += 14) ctx.lineTo(x, 118 - Math.random() * 82);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Monitor({ w, h, kind, position, rotationY = 0, active }) {
  const tex = useMemo(() => screenTexture(kind), [kind]);
  const matRef = useRef();
  useFrame(() => {
    if (matRef.current)
      matRef.current.emissiveIntensity = active ? 0.6 + Math.random() * 0.1 : 0.3;
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh castShadow>
        <boxGeometry args={[w + 0.03, h + 0.03, 0.03]} />
        <meshStandardMaterial color="#1c1e22" roughness={0.35} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.017]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          ref={matRef} map={tex} emissiveMap={tex}
          emissive="#ffffff" emissiveIntensity={0.5} color="#111111" roughness={0.35}
        />
      </mesh>
      <mesh position={[0, -(h / 2 + 0.08), -0.01]}>
        <boxGeometry args={[0.05, 0.16, 0.03]} />
        <meshStandardMaterial color="#24262b" metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[0, -(h / 2 + 0.155), 0.02]}>
        <cylinderGeometry args={[0.12, 0.13, 0.015, 20]} />
        <meshStandardMaterial color="#24262b" metalness={0.5} roughness={0.35} />
      </mesh>
    </group>
  );
}

function Chair() {
  const fab = { color: "#33373e", roughness: 0.92 };
  return (
    <group position={[0, 0, 0.7]}>
      <mesh position={[0, 0.47, 0]} castShadow><boxGeometry args={[0.5, 0.09, 0.48]} /><meshStandardMaterial {...fab} /></mesh>
      <mesh position={[0, 0.84, 0.26]} rotation={[0.1, 0, 0]} castShadow><boxGeometry args={[0.48, 0.58, 0.08]} /><meshStandardMaterial {...fab} /></mesh>
      <mesh position={[0, 0.28, 0]}><cylinderGeometry args={[0.028, 0.028, 0.3, 10]} /><meshStandardMaterial color="#707680" metalness={0.85} roughness={0.25} /></mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <group key={i}>
            <mesh position={[Math.sin(a) * 0.15, 0.11, Math.cos(a) * 0.15]} rotation={[0, a, 0]}>
              <boxGeometry args={[0.05, 0.03, 0.3]} /><meshStandardMaterial color="#2a2d32" metalness={0.5} roughness={0.4} />
            </mesh>
            <mesh position={[Math.sin(a) * 0.28, 0.035, Math.cos(a) * 0.28]}>
              <sphereGeometry args={[0.032, 10, 8]} /><meshStandardMaterial color="#17181b" roughness={0.5} />
            </mesh>
          </group>
        );
      })}
      {[-0.28, 0.28].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.58, 0.05]}><boxGeometry args={[0.04, 0.2, 0.04]} /><meshStandardMaterial color="#24262b" /></mesh>
          <mesh position={[x, 0.69, 0.02]}><boxGeometry args={[0.06, 0.03, 0.3]} /><meshStandardMaterial color="#1e2024" roughness={0.6} /></mesh>
        </group>
      ))}
    </group>
  );
}

export default function Workstation({ def, spot, mugColor }) {
  const agent = useSim((s) => s.agents.find((a) => a.id === def.id));
  const select = useSim((s) => s.select);
  const orbRef = useRef();
  const st = agent?.state || "idle";
  const active = st === "working" || st === "collab";

  useFrame(({ clock }) => {
    if (!orbRef.current) return;
    const t = clock.elapsedTime;
    const pulse = st === "idle" ? 0.05 : 0.22;
    orbRef.current.scale.setScalar(1 + Math.sin(t * 4) * pulse);
    orbRef.current.material.opacity =
      st === "blocked" ? (Math.sin(t * 9) > 0 ? 1 : 0.15) : 0.9;
    orbRef.current.material.color.set(STATUS[st].hex);
  });

  return (
    <group position={[spot.x, 0, spot.z]} rotation={[0, spot.ry, 0]}>
      {/* Stol */}
      <mesh position={[0, 0.755, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.05, 0.9]} />
        <meshStandardMaterial color="#a57d52" roughness={0.5} />
      </mesh>
      {[[-0.86, -0.36], [0.86, -0.36], [-0.86, 0.36], [0.86, 0.36]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.36, z]}>
          <cylinderGeometry args={[0.025, 0.022, 0.72, 10]} />
          <meshStandardMaterial color="#2f2c29" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}

      <Chair />

      {/* Klaviatura + sichqoncha */}
      <mesh position={[-0.06, 0.79, 0.22]} castShadow>
        <boxGeometry args={[0.4, 0.022, 0.14]} />
        <meshStandardMaterial color="#2b2f36" roughness={0.55} />
      </mesh>
      <mesh position={[0.26, 0.79, 0.24]} scale={[0.85, 0.55, 1.3]}>
        <sphereGeometry args={[0.042, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#2b2f36" roughness={0.4} />
      </mesh>

      {/* Krujka */}
      <group position={[-0.66, 0.785, 0.08]}>
        <mesh position={[0, 0.042, 0]}><cylinderGeometry args={[0.033, 0.028, 0.085, 14]} /><meshStandardMaterial color={mugColor} roughness={0.35} /></mesh>
        <mesh position={[0.038, 0.045, 0]}><torusGeometry args={[0.022, 0.006, 8, 16]} /><meshStandardMaterial color={mugColor} roughness={0.35} /></mesh>
      </group>

      {/* Monitorlar */}
      {def.gear === "dualmon" ? (
        <>
          <Monitor w={0.6} h={0.38} kind="design" position={[-0.33, 1.08, -0.22]} rotationY={0.16} active={active} />
          <Monitor w={0.6} h={0.38} kind="code" position={[0.33, 1.08, -0.22]} rotationY={-0.16} active={active} />
        </>
      ) : (
        <Monitor w={0.76} h={0.45} kind={def.screen} position={[0, 1.12, -0.24]} active={active} />
      )}

      {/* GLB personaj (yoki placeholder) — ekranga qaragan holda */}
      <group position={[0, 0, 0.66]}>
        <AgentCharacter def={def} state={st} />
      </group>

      {/* Holat orbi */}
      <mesh ref={orbRef} position={[0, 1.72, 0.6]}>
        <sphereGeometry args={[0.032, 12, 10]} />
        <meshBasicMaterial transparent />
      </mesh>

      {/* Ism yorlig'i */}
      <Billboard position={[0, 2.0, 0.6]}>
        <Text fontSize={0.14} color="#ffffff" outlineWidth={0.008} outlineColor="#000000" anchorY="bottom">
          {def.name}
        </Text>
        <Text fontSize={0.085} color="#d8dee8" outlineWidth={0.005} outlineColor="#000000" position={[0, -0.02, 0]} anchorY="top">
          {def.role}
        </Text>
      </Billboard>

      {/* Klik hitbox */}
      <mesh
        position={[0, 1, 0.35]}
        visible={false}
        onClick={(e) => { e.stopPropagation(); select(def.id); }}
      >
        <sphereGeometry args={[1.1, 8, 8]} />
      </mesh>
    </group>
  );
}
