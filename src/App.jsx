import React, { useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { OfficeEnvironment, Hub, Beams } from "./components/Office.jsx";
import Workstation from "./components/Workstation.jsx";
import Overlay from "./ui/Overlay.jsx";
import { AGENTS, SPOTS } from "./config.js";
import { useSim } from "./state/simulation.js";
import { startTransport } from "./state/transport.js";

const MUG_COLORS = ["#b03a2e", "#2471a3", "#d68910", "#1e8449", "#7d3c98", "#117a65"];

export default function App() {
  const select = useSim((s) => s.select);

  // Manba tanlash transport tikuvi ichida (config.SOURCE: sim | ws).
  useEffect(() => startTransport(), []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <Canvas
        shadows
        camera={{ position: [7, 6.5, 8], fov: 46 }}
        gl={{
          antialias: true,
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
          outputColorSpace: SRGBColorSpace,
        }}
        onPointerMissed={() => select(null)}
      >
        <color attach="background" args={["#0d1015"]} />
        <OfficeEnvironment />
        <Hub />
        <Beams />
        {AGENTS.map((def, i) => (
          <Workstation key={def.id} def={def} spot={SPOTS[i]} mugColor={MUG_COLORS[i]} />
        ))}
        <OrbitControls
          target={[0, 1, 0]}
          minDistance={4.5}
          maxDistance={15}
          maxPolarAngle={Math.PI * 0.47}
          minPolarAngle={Math.PI * 0.12}
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.35}
        />
      </Canvas>
      <Overlay />
    </div>
  );
}
