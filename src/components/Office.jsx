import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Text, Billboard } from "@react-three/drei";
import { useSim } from "../state/simulation.js";
import { SPOTS, AGENTS } from "../config.js";
import * as THREE from "three";

const RW = 17, RD = 12, WH = 3.7;

// ── Pol teksturasi
function floorTexture() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  const ctx = c.getContext("2d");
  const base = [156, 118, 78];
  for (let r = 0; r < 8; r++) {
    let x = r % 2 === 0 ? 0 : -128;
    while (x < 512) {
      const w = 200 + Math.random() * 120;
      const j = (Math.random() - 0.5) * 26;
      ctx.fillStyle = `rgb(${base[0] + j},${base[1] + j * 0.8},${base[2] + j * 0.6})`;
      ctx.fillRect(x, r * 64, w, 64);
      ctx.strokeStyle = "rgba(70,48,30,0.5)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, r * 64, w, 64);
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2.2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function skylineTexture() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const ctx = c.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, "#a8cdf0"); sky.addColorStop(0.55, "#dcebf7"); sky.addColorStop(1, "#f2e9d8");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 1024, 512);
  const glow = ctx.createRadialGradient(300, 130, 10, 300, 130, 220);
  glow.addColorStop(0, "rgba(255,244,214,0.95)"); glow.addColorStop(1, "rgba(255,244,214,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = "rgba(140,158,178,0.55)";
  for (let x = 0; x < 1024; x += 70) ctx.fillRect(x, 512 - (90 + Math.random() * 120) - 60, 54, 90 + Math.random() * 120);
  ctx.fillStyle = "rgba(96,112,130,0.85)";
  for (let x = -20; x < 1024; x += 110) {
    const h = 140 + Math.random() * 170;
    ctx.fillRect(x, 512 - h, 86, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function OfficeEnvironment() {
  const floorTex = useMemo(floorTexture, []);
  const skyTex = useMemo(skylineTexture, []);

  return (
    <group>
      {/* HDRI muhit — materiallarga tabiiy aks beradi */}
      <Environment preset="apartment" />

      {/* Yorug'lik */}
      <hemisphereLight args={["#bdd4ec", "#6b5334", 0.5]} />
      <directionalLight
        position={[3, 7, -10]} intensity={2.2} color="#ffe7c0"
        castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-11} shadow-camera-right={11}
        shadow-camera-top={10} shadow-camera-bottom={-10}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-5, 5, 6]} intensity={0.3} color="#cfdff2" />
      {[-4, 4].map((x) => (
        <pointLight key={x} position={[x, 3.4, 1]} intensity={0.5} distance={9} decay={2} color="#ffe3bb" />
      ))}

      {/* Pol */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[RW, RD]} />
        <meshStandardMaterial map={floorTex} roughness={0.55} />
      </mesh>
      <ContactShadows position={[0, 0.005, 0]} opacity={0.45} scale={20} blur={2.2} far={4} />

      {/* Gilam */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} receiveShadow>
        <circleGeometry args={[2.7, 48]} />
        <meshStandardMaterial color="#5c6a76" roughness={0.98} />
      </mesh>

      {/* Devorlar */}
      <mesh position={[0, WH / 2, -RD / 2]} receiveShadow>
        <planeGeometry args={[RW, WH]} /><meshStandardMaterial color="#cfc8ba" roughness={0.96} />
      </mesh>
      <mesh position={[0, WH / 2, RD / 2]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[RW, WH]} /><meshStandardMaterial color="#5a6a58" roughness={0.96} />
      </mesh>
      <mesh position={[-RW / 2, WH / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[RD, WH]} /><meshStandardMaterial color="#cfc8ba" roughness={0.96} />
      </mesh>
      <mesh position={[RW / 2, WH / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[RD, WH]} /><meshStandardMaterial color="#cfc8ba" roughness={0.96} />
      </mesh>
      {/* Shift */}
      <mesh position={[0, WH, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[RW, RD]} /><meshStandardMaterial color="#e4dfd4" roughness={0.98} />
      </mesh>
      {[-4.2, 0, 4.2].map((x) =>
        [-2, 2].map((z) => (
          <mesh key={`${x}${z}`} position={[x, WH - 0.03, z]}>
            <boxGeometry args={[1.3, 0.05, 0.35]} />
            <meshStandardMaterial color="#ffffff" emissive="#fff2da" emissiveIntensity={1.4} />
          </mesh>
        ))
      )}

      {/* Shahar manzarasi + derazalar */}
      <mesh position={[0, 2.6, -RD / 2 - 1.6]}>
        <planeGeometry args={[24, 9]} /><meshBasicMaterial map={skyTex} />
      </mesh>
      {[-5.2, 0, 5.2].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.95, -RD / 2 + 0.045]}>
            <planeGeometry args={[3.05, 2.05]} /><meshBasicMaterial map={skyTex} />
          </mesh>
          <mesh position={[x, 1.95, -RD / 2 + 0.02]}>
            <boxGeometry args={[3.3, 2.3, 0.1]} />
            <meshStandardMaterial color="#3e3a34" roughness={0.5} metalness={0.2} />
          </mesh>
          <mesh position={[x, 1.95, -RD / 2 + 0.08]}>
            <boxGeometry args={[0.05, 2.1, 0.06]} /><meshStandardMaterial color="#3e3a34" />
          </mesh>
          <mesh position={[x, 1.95, -RD / 2 + 0.08]}>
            <boxGeometry args={[3.1, 0.05, 0.06]} /><meshStandardMaterial color="#3e3a34" />
          </mesh>
          <mesh position={[x, 0.82, -RD / 2 + 0.12]}>
            <boxGeometry args={[3.35, 0.05, 0.22]} /><meshStandardMaterial color="#d9d4c8" roughness={0.6} />
          </mesh>
        </group>
      ))}

      {/* O'simliklar (sodda) */}
      {[[-RW / 2 + 0.8, RD / 2 - 0.9], [RW / 2 - 0.7, -RD / 2 + 0.8], [-RW / 2 + 0.7, -RD / 2 + 0.9]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} scale={1.5}>
          <mesh position={[0, 0.12, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.11, 0.24, 14]} /><meshStandardMaterial color="#b0653c" roughness={0.85} />
          </mesh>
          {[0, 1, 2, 3, 4, 5, 6].map((k) => {
            const a = (k / 7) * Math.PI * 2;
            return (
              <mesh key={k} position={[Math.cos(a) * 0.05, 0.5, Math.sin(a) * 0.05]}
                rotation={[Math.sin(a) * 0.4, 0, Math.cos(a) * -0.4]} castShadow>
                <coneGeometry args={[0.045, 0.55, 5]} />
                <meshStandardMaterial color={k % 2 ? "#4a7d52" : "#3c6a44"} roughness={0.75} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

// ── Markaziy orkestrator gologrammasi
export function Hub() {
  const coreRef = useRef();
  const r1 = useRef(); const r2 = useRef();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (coreRef.current) {
      coreRef.current.rotation.y += 0.012;
      coreRef.current.position.y = 1.45 + Math.sin(t * 1.2) * 0.04;
      coreRef.current.material.emissiveIntensity = 1.0 + Math.sin(t * 2.6) * 0.35;
    }
    if (r1.current) r1.current.rotation.x = t * 0.5;
    if (r2.current) r2.current.rotation.z = t * 0.35;
  });
  return (
    <group>
      <pointLight position={[0, 1.8, 0]} intensity={0.7} distance={5} decay={2} color="#3a8fe8" />
      <mesh position={[0, 0.73, 0]} castShadow>
        <cylinderGeometry args={[0.8, 0.88, 0.09, 36]} />
        <meshStandardMaterial color="#33383f" roughness={0.3} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.18, 0.34, 0.7, 24]} />
        <meshStandardMaterial color="#272b31" roughness={0.45} metalness={0.5} />
      </mesh>
      <mesh ref={coreRef} position={[0, 1.45, 0]}>
        <octahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color="#2f8fe6" emissive="#2f8fe6" emissiveIntensity={1.2}
          transparent opacity={0.9} roughness={0.2} metalness={0.3} />
      </mesh>
      <mesh ref={r1} position={[0, 1.45, 0]}>
        <torusGeometry args={[0.44, 0.006, 8, 48]} />
        <meshBasicMaterial color="#6db4f2" transparent opacity={0.55} />
      </mesh>
      <mesh ref={r2} position={[0, 1.45, 0]} scale={1.35}>
        <torusGeometry args={[0.44, 0.006, 8, 48]} />
        <meshBasicMaterial color="#6db4f2" transparent opacity={0.55} />
      </mesh>
      <Billboard position={[0, 2.15, 0]}>
        <Text fontSize={0.15} color="#ffffff" outlineWidth={0.008} outlineColor="#000000" anchorY="bottom">Atlas</Text>
        <Text fontSize={0.09} color="#d8dee8" outlineWidth={0.005} outlineColor="#000000" position={[0, -0.02, 0]} anchorY="top">Orkestrator</Text>
      </Billboard>
    </group>
  );
}

// ── Vazifa nur oqimlari (hub↔agent, agent↔agent)
const HUB_POS = new THREE.Vector3(0, 1.45, 0);
function posOf(id) {
  if (id === "hub") return HUB_POS;
  const idx = AGENTS.findIndex((a) => a.id === id);
  const s = SPOTS[idx];
  const off = s.ry === 0 ? 0.66 : -0.66;
  return new THREE.Vector3(s.x, 1.4, s.z + off);
}

export function Beams() {
  const beams = useSim((s) => s.beams);
  return (
    <group>
      {beams.map((b) => (
        <BeamParticles key={b.id} beam={b} />
      ))}
    </group>
  );
}

function BeamParticles({ beam }) {
  const refs = useRef([]);
  const from = useMemo(() => posOf(beam.fromId), [beam.fromId]);
  const to = useMemo(() => posOf(beam.toId), [beam.toId]);
  useFrame(() => {
    const age = (performance.now() - beam.born) / 1000;
    refs.current.forEach((m, k) => {
      if (!m) return;
      const off = (k / 5 + age * 0.55) % 1;
      m.position.lerpVectors(from, to, off);
      m.position.y += Math.sin(off * Math.PI) * 0.6;
      m.material.opacity = Math.max(0, Math.min(1, 2.4 - age)) * 0.85;
    });
  });
  return (
    <group>
      {[0, 1, 2, 3, 4].map((k) => (
        <mesh key={k} ref={(el) => (refs.current[k] = el)}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshBasicMaterial color={beam.color} transparent />
        </mesh>
      ))}
    </group>
  );
}
