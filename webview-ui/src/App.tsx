import { Html, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import Decor from "./scene/Decor";
import Effects from "./scene/Effects";
import OfficeEnvironment, { Hub } from "./scene/OfficeEnvironment";
import PixelPerson from "./scene/PixelPerson";
import { ROLE_PRESETS } from "./scene/roles";
import Workstation from "./scene/Workstation";
import { useOffice } from "./store";
import Hud from "./ui/Hud";
import { useExtensionMessages } from "./useExtensionMessages";

// Debug SHOT rejimi (o'zim skrinshot bilan tekshirish uchun):
// ?shot&cx=..&cy=..&cz=..&tx=..&ty=..&tz=.. — kamerани belgilangan joyга qaratadi.
const Q = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
const SHOT = Q.has("shot");
const qn = (k: string, d: number) => (Q.has(k) ? parseFloat(Q.get(k)!) : d);
const SHOT_CAM: [number, number, number] = [qn("cx", 7), qn("cy", 6.5), qn("cz", 8)];
const SHOT_TARGET: [number, number, number] = [qn("tx", 0), qn("ty", 1), qn("tz", 0)];

// Galereya rejimi: ?gallery — 6 personajни qatorда yuzма-yuz ko'rsatadi.
const GALLERY = Q.has("gallery");

function Gallery() {
  const roles = Object.entries(ROLE_PRESETS);
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 1.2, 6.4], fov: 44 }} gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}>
      <color attach="background" args={["#2a2f38"]} />
      <ambientLight intensity={0.7} />
      <hemisphereLight args={["#cfe0ff", "#20242c", 0.6]} />
      <directionalLight position={[3, 6, 4]} intensity={1.4} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 8]} />
        <meshStandardMaterial color="#333a45" roughness={1} />
      </mesh>
      {roles.map(([key, preset], i) => {
        const x = (i - (roles.length - 1) / 2) * 1.5;
        return (
          <group key={key} position={[x, 0, 0]}>
            {/* kichik kursi taxta */}
            <mesh position={[0, 0.45, 0.02]} castShadow>
              <boxGeometry args={[0.5, 0.1, 0.5]} />
              <meshStandardMaterial color="#22262d" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.22, 0]}>
              <cylinderGeometry args={[0.05, 0.06, 0.44, 10]} />
              <meshStandardMaterial color="#3a3f48" />
            </mesh>
            <group rotation={[0, Math.PI, 0]}>
              <PixelPerson skin={preset} status="idle" />
            </group>
            <Html position={[0, 1.75, 0]} center distanceFactor={7} style={{ pointerEvents: "none" }}>
              <div style={{ fontFamily: "system-ui", color: "#fff", fontSize: 13, fontWeight: 600, textAlign: "center", whiteSpace: "nowrap", textShadow: "0 1px 3px #000" }}>
                {preset.label}
              </div>
            </Html>
          </group>
        );
      })}
      <OrbitControls target={[0, 0.9, 0]} enablePan={false} />
    </Canvas>
  );
}

export default function App() {
  useExtensionMessages();
  const order = useOffice((s) => s.order);
  const agents = useOffice((s) => s.agents);
  const select = useOffice((s) => s.select);

  if (GALLERY) return <Gallery />;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        performance={{ min: 0.5 }}
        camera={{ position: SHOT_CAM, fov: 46 }}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
          outputColorSpace: SRGBColorSpace,
        }}
        onPointerMissed={() => select(null)}
      >
        <color attach="background" args={["#0d1015"]} />
        <Suspense fallback={null}>
          <OfficeEnvironment />
          <Decor />
          <Hub />
          {order.map((id) => {
            const a = agents[id];
            return a ? <Workstation key={id} agent={a} /> : null;
          })}
          <Effects />
        </Suspense>
        <OrbitControls
          target={SHOT_TARGET}
          minDistance={4.5}
          maxDistance={15}
          maxPolarAngle={Math.PI * 0.42}
          minPolarAngle={Math.PI * 0.12}
          enablePan={false}
          autoRotate={!SHOT && order.length === 0}
          autoRotateSpeed={0.3}
        />
      </Canvas>
      <Hud />
    </div>
  );
}
