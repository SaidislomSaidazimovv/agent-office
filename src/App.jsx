import React, { useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { OfficeEnvironment, Hub, Beams } from "./components/Office.jsx";
import Workstation from "./components/Workstation.jsx";
import Decor from "./components/Decor.jsx";
import Effects from "./components/Effects.jsx";
import Overlay from "./ui/Overlay.jsx";
import { AGENTS, SPOTS } from "./config.js";
import { useSim } from "./state/simulation.js";
import { startTransport } from "./state/transport.js";

const MUG_COLORS = ["#b03a2e", "#2471a3", "#d68910", "#1e8449", "#7d3c98", "#117a65"];

// Debug "shot" rejimi: ?shot bilan aylanish o'chadi va kamera URL params bilan
// belgilangan joyga qaratiladi (o'zim skrinshot olib tekshirish uchun).
const Q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const SHOT = Q.has("shot");
const qn = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);
const CAM = [qn("cx", 7), qn("cy", 6.5), qn("cz", 8)];
const TARGET = [qn("tx", 0), qn("ty", 1), qn("tz", 0)];

export default function App() {
  const select = useSim((s) => s.select);

  // Manba tanlash transport tikuvi ichida (config.SOURCE: sim | ws).
  useEffect(() => startTransport(), []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        performance={{ min: 0.5 }}
        camera={{ position: CAM, fov: 46 }}
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
        <OfficeEnvironment />
        <Decor />
        <Hub />
        <Beams />
        {AGENTS.map((def, i) => (
          <Workstation key={def.id} def={def} spot={SPOTS[i]} mugColor={MUG_COLORS[i]} />
        ))}
        <OrbitControls
          target={TARGET}
          minDistance={4.5}
          maxDistance={15}
          maxPolarAngle={Math.PI * 0.42}
          minPolarAngle={Math.PI * 0.12}
          enablePan={false}
          autoRotate={!SHOT}
          autoRotateSpeed={0.35}
        />
        <Effects />
      </Canvas>
      {!SHOT && <Overlay />}
    </div>
  );
}
