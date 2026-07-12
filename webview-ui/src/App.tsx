import { Html, OrbitControls, OrthographicCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { useLayout } from "./layoutStore";
import AgentAvatar from "./scene/AgentAvatar";
import { setActiveSeats, setPlacedRects } from "./scene/collision";
import FirstPersonView from "./scene/FirstPersonView";
import { footprint } from "./scene/furniture";
import OfficeDecor from "./scene/OfficeDecor";
import PlacedFurniture from "./scene/PlacedFurniture";
import SeatMarkers from "./scene/SeatMarkers";
import PixelPerson from "./scene/PixelPerson";
import Room from "./scene/Room";
import { ROLE_PRESETS } from "./scene/roles";
import { updateFrustum } from "./scene/visibility";
import Workstation from "./scene/Workstation";
import { useOffice } from "./store";
import Hud from "./ui/Hud";
import { PerfOverlay, PerfProbe, PERF_ENABLED } from "./ui/PerfHud";
import { useExtensionMessages } from "./useExtensionMessages";

// Soya xaritasini HAR FREYM emas, ~4 freymda bir yangilaymiz. Agentlar sekin
// harakatlanadi, shuning uchun 15Hz soya ko'zga ilinmaydi — lekin har freym
// butun sahnani soya-o'tishда qayta chizishni yo'q qiladi (asosiy "qotish" sabab).
function ShadowThrottle() {
  const gl = useThree((s) => s.gl);
  const f = useRef(0);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
  }, [gl]);
  useFrame((state) => {
    updateFrustum(state.camera); // perf culling — har agent shundan foydalanadi
    if (f.current++ % 4 === 0) gl.shadowMap.needsUpdate = true;
  });
  return null;
}

// Xarajat/token vaqt qatori — har 10s bir namuna (dashboard grafigi uchun).
// Sof ma'lumot yig'ish: render ham, 3D ham yo'q.
function CostSampler() {
  const sample = useOffice((s) => s.sample);
  useEffect(() => {
    sample(); // darrov birinchi nuqta
    const t = setInterval(sample, 10000);
    return () => clearInterval(t);
  }, [sample]);
  return null;
}

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
  const setMoving = useOffice((s) => s.setMoving);
  const cameraMode = useOffice((s) => s.cameraMode);

  // Collision faqat BAND stollar uchun bo'lsin (bo'sh o'rindiqlar fantom devor
  // yasamasin). Faqat o'rindiqlar to'plami o'zgarganda yangilanadi.
  const seatKey = order.map((id) => agents[id]?.seatIndex).join(",");
  useEffect(() => {
    setActiveSeats(order.map((id) => agents[id]?.seatIndex).filter((i): i is number => typeof i === "number"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatKey]);

  // Joylashtirilgan mebel collision'i (personaj/kamera ular orqali o'tmasin).
  const placed = useLayout((s) => s.items);
  const dragging = useLayout((s) => s.draggingId);
  useEffect(() => {
    setPlacedRects(placed.map((it) => {
      const f = footprint(it.type, it.ry);
      return { x0: it.x - f.hx, x1: it.x + f.hx, z0: it.z - f.hz, z1: it.z + f.hz };
    }));
  }, [placed]);

  if (GALLERY) return <Gallery />;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        shadows
        dpr={1}
        gl={{ antialias: true, powerPreference: "high-performance", toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}
        onPointerMissed={() => { select(null); setMoving(null); }}
      >
        <ShadowThrottle />
        {/* Fon rangi Room ichidagi Daylight'da (kun/tun sikli) */}
        {cameraMode === "iso" ? (
          <>
            <OrthographicCamera makeDefault position={[34, 27, 34]} zoom={20} near={-300} far={800} />
            <OrbitControls enabled={!dragging} target={[0, 0.8, 0]} enablePan minZoom={12} maxZoom={70} maxPolarAngle={Math.PI * 0.44} minPolarAngle={Math.PI * 0.18} />
          </>
        ) : (
          <FirstPersonView />
        )}

        <Room mode={cameraMode} />
        <OfficeDecor />
        <PlacedFurniture />
        <SeatMarkers />
        {order.map((id) => {
          const a = agents[id];
          return a ? <Workstation key={id} agent={a} /> : null;
        })}
        {order.map((id) => {
          const a = agents[id];
          return a ? <AgentAvatar key={`av-${id}`} agent={a} /> : null;
        })}
        {PERF_ENABLED && <PerfProbe />}
      </Canvas>
      <CostSampler />
      <Hud />
      {PERF_ENABLED && <PerfOverlay />}
    </div>
  );
}
