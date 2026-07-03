import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import Decor from "./scene/Decor";
import Effects from "./scene/Effects";
import OfficeEnvironment, { Hub } from "./scene/OfficeEnvironment";
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

export default function App() {
  useExtensionMessages();
  const order = useOffice((s) => s.order);
  const agents = useOffice((s) => s.agents);
  const select = useOffice((s) => s.select);

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
