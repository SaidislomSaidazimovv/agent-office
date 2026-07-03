// ── Katta kompaniya ofisi — xona (yengil low-poly) ───────────
export const ROOM = { W: 32, D: 26, WH: 3 };

export default function Room() {
  const { W, D, WH } = ROOM;
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

      {/* Pol — iliq krem, zonalar bilan */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#e9e2d2" roughness={1} />
      </mesh>
      {/* Ochiq yog'och zona (markaz — ish joylari) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[16, 10]} />
        <meshStandardMaterial color="#d8c7a8" roughness={1} />
      </mesh>

      {/* Devorlar (orqa + yon, past) */}
      <mesh position={[0, WH / 2, -D / 2]} receiveShadow>
        <boxGeometry args={[W, WH, 0.3]} />
        <meshStandardMaterial color="#dcd3c2" roughness={1} />
      </mesh>
      <mesh position={[-W / 2, WH / 2, 0]} receiveShadow>
        <boxGeometry args={[0.3, WH, D]} />
        <meshStandardMaterial color="#d2c9b7" roughness={1} />
      </mesh>
      <mesh position={[W / 2, WH / 2, 0]} receiveShadow>
        <boxGeometry args={[0.3, WH, D]} />
        <meshStandardMaterial color="#d2c9b7" roughness={1} />
      </mesh>
    </group>
  );
}
