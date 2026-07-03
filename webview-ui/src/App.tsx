import { Html, OrbitControls, OrthographicCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import AgentAvatar from "./scene/AgentAvatar";
import FirstPersonView from "./scene/FirstPersonView";
import OfficeDecor from "./scene/OfficeDecor";
import PixelPerson from "./scene/PixelPerson";
import Room from "./scene/Room";
import { ROLE_PRESETS } from "./scene/roles";
import Workstation from "./scene/Workstation";
import { useOffice } from "./store";
import Hud from "./ui/Hud";
import { useExtensionMessages } from "./useExtensionMessages";

// Debug/galereya rejimlari (o'zim tekshirish uchun)
const Q = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
const GALLERY = Q.has("gallery");

function Gallery() {
  const roles = Object.entries(ROLE_PRESETS);
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 1.2, 6.4], fov: 44 }} gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}>
      <color attach="background" args={["#2a2f38"]} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 6, 4]} intensity={1.1} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 8]} />
        <meshStandardMaterial color="#333a45" roughness={1} />
      </mesh>
      {roles.map(([key, preset], i) => {
        const x = (i - (roles.length - 1) / 2) * 1.5;
        return (
          <group key={key} position={[x, 0, 0]}>
            <mesh position={[0, 0.45, 0.02]} castShadow>
              <boxGeometry args={[0.5, 0.1, 0.5]} />
              <meshStandardMaterial color="#22262d" roughness={0.8} />
            </mesh>
            <group rotation={[0, Math.PI, 0]}>
              <PixelPerson skin={preset} status="idle" pose="stand" />
            </group>
            <Html position={[0, 1.75, 0]} center style={{ pointerEvents: "none" }}>
              <div style={{ fontFamily: "system-ui", color: "#fff", fontSize: 13, fontWeight: 600, textAlign: "center", whiteSpace: "nowrap", textShadow: "0 1px 3px #000" }}>{preset.label}</div>
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
  const cameraMode = useOffice((s) => s.cameraMode);

  if (GALLERY) return <Gallery />;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        shadows
        dpr={[1, 1.25]}
        gl={{ antialias: true, powerPreference: "high-performance", toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}
        onPointerMissed={() => select(null)}
      >
        <color attach="background" args={["#11151c"]} />

        {cameraMode === "iso" ? (
          <>
            <OrthographicCamera makeDefault position={[24, 20, 24]} zoom={30} near={-200} far={600} />
            <OrbitControls target={[0, 0.8, 0]} enablePan minZoom={18} maxZoom={80} maxPolarAngle={Math.PI * 0.44} minPolarAngle={Math.PI * 0.18} />
          </>
        ) : (
          <FirstPersonView />
        )}

        <Room mode={cameraMode} />
        <OfficeDecor />
        {order.map((id) => {
          const a = agents[id];
          return a ? <Workstation key={id} agent={a} /> : null;
        })}
        {order.map((id) => {
          const a = agents[id];
          return a ? <AgentAvatar key={`av-${id}`} agent={a} /> : null;
        })}
      </Canvas>
      <Hud />
    </div>
  );
}
