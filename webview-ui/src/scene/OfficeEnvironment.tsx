import { ContactShadows, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { useACGTextures } from "../three/acgMaterial";

const RW = 17;
const RD = 12;
const WH = 3.7;

// ── Fallback pol teksturasi (canvas — PBR yuklanmasa) ──
function floorTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
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

function skylineTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, "#a8cdf0");
  sky.addColorStop(0.55, "#dcebf7");
  sky.addColorStop(1, "#f2e9d8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);
  const glow = ctx.createRadialGradient(300, 130, 10, 300, 130, 220);
  glow.addColorStop(0, "rgba(255,244,214,0.95)");
  glow.addColorStop(1, "rgba(255,244,214,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1024, 512);
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

// ── PBR teksturali xona yuzalari ──
function RoomSurfaces() {
  const floor = useACGTextures("Tiles081_1K-PNG", [10, 7]);
  const ceiling = useACGTextures("Tiles045_1K-PNG", [10, 7]);
  const wallEnd = useACGTextures("Bricks053_1K-PNG", [10, 3]);
  const wallSide = useACGTextures("Bricks053_1K-PNG", [7, 3]);
  const rug = useACGTextures("Carpet005_1K-PNG", [4, 4]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[RW, RD]} />
        <meshStandardMaterial {...floor} roughness={1} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} receiveShadow>
        <circleGeometry args={[2.7, 48]} />
        <meshStandardMaterial {...rug} roughness={1} />
      </mesh>
      <mesh position={[0, WH / 2, -RD / 2]} receiveShadow>
        <planeGeometry args={[RW, WH]} />
        <meshStandardMaterial {...wallEnd} roughness={1} />
      </mesh>
      <mesh position={[0, WH / 2, RD / 2]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[RW, WH]} />
        <meshStandardMaterial {...wallEnd} roughness={1} />
      </mesh>
      <mesh position={[-RW / 2, WH / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[RD, WH]} />
        <meshStandardMaterial {...wallSide} roughness={1} />
      </mesh>
      <mesh position={[RW / 2, WH / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[RD, WH]} />
        <meshStandardMaterial {...wallSide} roughness={1} />
      </mesh>
      <mesh position={[0, WH, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[RW, RD]} />
        <meshStandardMaterial {...ceiling} roughness={1} />
      </mesh>
    </group>
  );
}

function PlainRoomSurfaces({ floorTex }: { floorTex: THREE.Texture }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[RW, RD]} />
        <meshStandardMaterial map={floorTex} roughness={0.55} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} receiveShadow>
        <circleGeometry args={[2.7, 48]} />
        <meshStandardMaterial color="#5c6a76" roughness={0.98} />
      </mesh>
      <mesh position={[0, WH / 2, -RD / 2]} receiveShadow>
        <planeGeometry args={[RW, WH]} />
        <meshStandardMaterial color="#cfc8ba" roughness={0.96} />
      </mesh>
      <mesh position={[0, WH / 2, RD / 2]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[RW, WH]} />
        <meshStandardMaterial color="#5a6a58" roughness={0.96} />
      </mesh>
      <mesh position={[-RW / 2, WH / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[RD, WH]} />
        <meshStandardMaterial color="#cfc8ba" roughness={0.96} />
      </mesh>
      <mesh position={[RW / 2, WH / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[RD, WH]} />
        <meshStandardMaterial color="#cfc8ba" roughness={0.96} />
      </mesh>
      <mesh position={[0, WH, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[RW, RD]} />
        <meshStandardMaterial color="#e4dfd4" roughness={0.98} />
      </mesh>
    </group>
  );
}

class SurfaceErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  constructor(p: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(p);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("Xona teksturasi yuklanmadi:", (err as Error)?.message);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function OfficeEnvironment() {
  const floorTex = useMemo(floorTexture, []);
  const skyTex = useMemo(skylineTexture, []);

  return (
    <group>
      {/* HDRI o'rniga to'ldiruvchi ambient (webview offline — CDN Environment yo'q) */}
      <ambientLight intensity={0.42} color="#cdd9ec" />
      <hemisphereLight args={["#bdd4ec", "#6b5334", 0.55]} />
      <directionalLight
        position={[3, 7, -10]}
        intensity={2.2}
        color="#ffe7c0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-5, 5, 6]} intensity={0.3} color="#cfdff2" />
      {[-4, 4].map((x) => (
        <pointLight key={x} position={[x, 3.4, 1]} intensity={0.5} distance={9} decay={2} color="#ffe3bb" />
      ))}

      <SurfaceErrorBoundary fallback={<PlainRoomSurfaces floorTex={floorTex} />}>
        <Suspense fallback={<PlainRoomSurfaces floorTex={floorTex} />}>
          <RoomSurfaces />
        </Suspense>
      </SurfaceErrorBoundary>
      <ContactShadows position={[0, 0.005, 0]} opacity={0.45} scale={20} blur={2.2} far={4} />

      {/* Shahar manzarasi + derazalar (orqa devor) */}
      <mesh position={[0, 2.6, -RD / 2 - 1.6]}>
        <planeGeometry args={[24, 9]} />
        <meshBasicMaterial map={skyTex} />
      </mesh>
      {[-5.2, 0, 5.2].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.95, -RD / 2 + 0.045]}>
            <planeGeometry args={[3.05, 2.05]} />
            <meshBasicMaterial map={skyTex} />
          </mesh>
          <mesh position={[x, 1.95, -RD / 2 + 0.02]}>
            <boxGeometry args={[3.3, 2.3, 0.1]} />
            <meshStandardMaterial color="#3e3a34" roughness={0.5} metalness={0.2} />
          </mesh>
          <mesh position={[x, 1.95, -RD / 2 + 0.08]}>
            <boxGeometry args={[0.05, 2.1, 0.06]} />
            <meshStandardMaterial color="#3e3a34" />
          </mesh>
          <mesh position={[x, 1.95, -RD / 2 + 0.08]}>
            <boxGeometry args={[3.1, 0.05, 0.06]} />
            <meshStandardMaterial color="#3e3a34" />
          </mesh>
          <mesh position={[x, 0.82, -RD / 2 + 0.12]}>
            <boxGeometry args={[3.35, 0.05, 0.22]} />
            <meshStandardMaterial color="#d9d4c8" roughness={0.6} />
          </mesh>
        </group>
      ))}

      {/* Sodda o'simliklar (burchaklarda) */}
      {[[-RW / 2 + 0.8, RD / 2 - 0.9], [RW / 2 - 0.7, -RD / 2 + 0.8], [-RW / 2 + 0.7, -RD / 2 + 0.9]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} scale={1.5}>
          <mesh position={[0, 0.12, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.11, 0.24, 14]} />
            <meshStandardMaterial color="#b0653c" roughness={0.85} />
          </mesh>
          {[0, 1, 2, 3, 4, 5, 6].map((k) => {
            const a = (k / 7) * Math.PI * 2;
            return (
              <mesh
                key={k}
                position={[Math.cos(a) * 0.05, 0.5, Math.sin(a) * 0.05]}
                rotation={[Math.sin(a) * 0.4, 0, Math.cos(a) * -0.4]}
                castShadow
              >
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

// ── Markaziy orkestrator gologrammasi (Atlas) ──
export function Hub() {
  const coreRef = useRef<THREE.Mesh>(null);
  const r1 = useRef<THREE.Mesh>(null);
  const r2 = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (coreRef.current) {
      coreRef.current.rotation.y += 0.012;
      coreRef.current.position.y = 1.45 + Math.sin(t * 1.2) * 0.04;
      (coreRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.0 + Math.sin(t * 2.6) * 0.35;
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
        <meshStandardMaterial
          color="#2f8fe6"
          emissive="#2f8fe6"
          emissiveIntensity={1.2}
          transparent
          opacity={0.9}
          roughness={0.2}
          metalness={0.3}
        />
      </mesh>
      <mesh ref={r1} position={[0, 1.45, 0]}>
        <torusGeometry args={[0.44, 0.006, 8, 48]} />
        <meshBasicMaterial color="#6db4f2" transparent opacity={0.55} />
      </mesh>
      <mesh ref={r2} position={[0, 1.45, 0]} scale={1.35}>
        <torusGeometry args={[0.44, 0.006, 8, 48]} />
        <meshBasicMaterial color="#6db4f2" transparent opacity={0.55} />
      </mesh>
      <Html position={[0, 2.15, 0]} center distanceFactor={10} style={{ pointerEvents: "none", textAlign: "center" }}>
        <div style={{ fontFamily: "system-ui, sans-serif", color: "#fff", whiteSpace: "nowrap" }}>
          <div style={{ fontWeight: 700, fontSize: 15, textShadow: "0 1px 3px #000" }}>Atlas</div>
          <div style={{ fontSize: 11, color: "#d8dee8", textShadow: "0 1px 3px #000" }}>Orkestrator</div>
        </div>
      </Html>
    </group>
  );
}
