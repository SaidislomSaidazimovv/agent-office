import type { CameraMode } from "../store";

// ── Ofis xonasi — dollhouse (yopiq bino, iso'да near-devorlar yashirin) ──
export const ROOM = { W: 46, D: 32, WH: 3.4 };

export default function Room({ mode }: { mode: CameraMode }) {
  const { W, D, WH } = ROOM;
  const fpv = mode === "fpv";
  const wallMat = "#dcd3c2";

  return (
    <group>
      {/* Yorug'lik */}
      <ambientLight intensity={0.85} />
      <hemisphereLight args={["#ffffff", "#c9c2b2", 0.6]} />
      <directionalLight
        position={[12, 18, 8]}
        intensity={0.8}
        color="#fff3e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-bias={-0.0005}
      />

      {/* Pol */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#e9e2d2" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[30, 14]} />
        <meshStandardMaterial color="#d8c7a8" roughness={1} />
      </mesh>

      {/* ── Perimetr devorlar (yopiq bino) ── */}
      {/* Uzoq devorlar — doim ko'rinadi */}
      <mesh position={[0, WH / 2, -D / 2]} receiveShadow>
        <boxGeometry args={[W, WH, 0.3]} />
        <meshStandardMaterial color={wallMat} roughness={1} />
      </mesh>
      <mesh position={[-W / 2, WH / 2, 0]} receiveShadow>
        <boxGeometry args={[0.3, WH, D]} />
        <meshStandardMaterial color="#d2c9b7" roughness={1} />
      </mesh>
      {/* Yaqin devorlar (kamerага qaragan) — iso'да yashirin, FPV'да ko'rinadi */}
      <mesh position={[0, WH / 2, D / 2]} visible={fpv} receiveShadow>
        <boxGeometry args={[W, WH, 0.3]} />
        <meshStandardMaterial color={wallMat} roughness={1} />
      </mesh>
      <mesh position={[W / 2, WH / 2, 0]} visible={fpv} receiveShadow>
        <boxGeometry args={[0.3, WH, D]} />
        <meshStandardMaterial color="#d2c9b7" roughness={1} />
      </mesh>

      {/* Shift — faqat FPV (ichkи ko'rinish yopiq bo'lsin) */}
      <mesh position={[0, WH, 0]} rotation={[Math.PI / 2, 0, 0]} visible={fpv}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#eae4d6" roughness={1} side={2} />
      </mesh>
    </group>
  );
}
