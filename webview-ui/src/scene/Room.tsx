// ── Yengil low-poly ofis xonasi (flat, izometrik) ────────────
// Og'ir PBR/GLB/postprocessing YO'Q — sof geometriya, tez ishlaydi.
// Namunадек: iliq krem pol, past devorlar, sodda yorug'lik.

const W = 20; // kenglik (x)
const D = 15; // chuqurlik (z)
const WH = 2.6; // past devor

export default function Room() {
  return (
    <group>
      {/* Yorug'lik — sodda, soya yengil */}
      <ambientLight intensity={0.85} />
      <hemisphereLight args={["#ffffff", "#c9c2b2", 0.6]} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={0.85}
        color="#fff3e0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.0005}
      />

      {/* Pol — iliq krem */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#e9e2d2" roughness={1} />
      </mesh>
      {/* Markaziy gilam */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[6.5, 8]} />
        <meshStandardMaterial color="#c8d4dc" roughness={1} />
      </mesh>

      {/* Past devorlar (orqa + yon) */}
      <mesh position={[0, WH / 2, -D / 2]} receiveShadow>
        <boxGeometry args={[W, WH, 0.3]} />
        <meshStandardMaterial color="#d8cfbe" roughness={1} />
      </mesh>
      <mesh position={[-W / 2, WH / 2, 0]} receiveShadow>
        <boxGeometry args={[0.3, WH, D]} />
        <meshStandardMaterial color="#cfc6b4" roughness={1} />
      </mesh>
      {/* pol chetи (plintus) */}
      <mesh position={[0, 0.05, -D / 2 + 0.2]}>
        <boxGeometry args={[W, 0.1, 0.06]} />
        <meshStandardMaterial color="#b7ad98" />
      </mesh>

      {/* Markaziy Atlas kristali (sodda, porlaydigan) */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <cylinderGeometry args={[0.6, 0.7, 0.12, 24]} />
          <meshStandardMaterial color="#3a3f48" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.05, 0]}>
          <octahedronGeometry args={[0.4, 0]} />
          <meshStandardMaterial color="#5e9bff" emissive="#3a6fd8" emissiveIntensity={0.7} roughness={0.3} />
        </mesh>
        <pointLight position={[0, 1.2, 0]} intensity={6} distance={7} color="#7fb0ff" />
      </group>
    </group>
  );
}
