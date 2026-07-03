import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import Hud from "./ui/Hud";
import Room from "./scene/Room";
import Workstation from "./scene/Workstation";
import { useOffice } from "./store";
import { useExtensionMessages } from "./useExtensionMessages";

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
        camera={{ position: [8, 7, 9], fov: 46 }}
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
        <Room />
        {order.map((id) => {
          const a = agents[id];
          return a ? <Workstation key={id} agent={a} /> : null;
        })}
        <OrbitControls
          target={[0, 1, 0]}
          minDistance={5}
          maxDistance={16}
          maxPolarAngle={Math.PI * 0.46}
          minPolarAngle={Math.PI * 0.12}
          enablePan={false}
          autoRotate={order.length === 0}
          autoRotateSpeed={0.3}
        />
      </Canvas>
      <Hud />
    </div>
  );
}
