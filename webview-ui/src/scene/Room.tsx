// ── Xona: pol, devorlar, markaziy hub, yorug'lik ─────────────
// PBR teksturalar keyingi bosqichда ulanadi (mavjud Office.jsx'дан).

const W = 14; // kenglik (x)
const D = 13; // chuqurlik (z)
const H = 4.5; // balandlik

export default function Room() {
  return (
    <group>
      {/* Pol */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#20242c" roughness={0.9} />
      </mesh>
      {/* Gilam (markaz) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[6, 7]} />
        <meshStandardMaterial color="#2b3340" roughness={1} />
      </mesh>
      {/* Orqa devor */}
      <mesh position={[0, H / 2, -D / 2]} receiveShadow>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#2a2f38" roughness={0.95} />
      </mesh>
      {/* Yon devorlar */}
      <mesh position={[-W / 2, H / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial color="#262b33" roughness={0.95} />
      </mesh>
      <mesh position={[W / 2, H / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial color="#262b33" roughness={0.95} />
      </mesh>

      {/* Markaziy hub (Atlas kristall) */}
      <mesh position={[0, 1.1, 0]} castShadow>
        <icosahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial color="#5e9bff" emissive="#3a6fd8" emissiveIntensity={0.6} roughness={0.3} metalness={0.4} />
      </mesh>
      <pointLight position={[0, 1.4, 0]} intensity={12} distance={9} color="#7fb0ff" />

      {/* Yorug'lik */}
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#cfe0ff", "#20242c", 0.5]} />
      <directionalLight
        position={[6, 9, 5]}
        intensity={1.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      {/* Tepa lampalar */}
      {[-4, 0, 4].map((x) =>
        [-3, 3].map((z) => (
          <pointLight key={`${x},${z}`} position={[x, H - 0.4, z]} intensity={4} distance={7} color="#ffe9c7" />
        )),
      )}
    </group>
  );
}
