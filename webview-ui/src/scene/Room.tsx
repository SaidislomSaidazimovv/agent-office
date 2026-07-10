import { useEffect } from "react";
import { useLayout } from "../layoutStore";
import type { CameraMode } from "../store";
import { useDaylight } from "./daylight";

// ── Ofis xonasi — dollhouse (yopiq bino, iso'da near-devorlar yashirin) ──
export const ROOM = { W: 46, D: 32, WH: 3.4 };

// Rangni och/to'q qilish (mavzu devorlari uchun).
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const cl = (v: number) => Math.max(0, Math.min(255, v));
  const r = cl(((n >> 16) & 255) + amt), g = cl(((n >> 8) & 255) + amt), b = cl((n & 255) + amt);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// Kun/tun yorug'ligi — parametrlar useDaylight store'dan, real soatдан ~30s'da
// yangilanadi (soat sekin o'zgargani uchun snap sezilmaydi). Fon rangi ham shundan.
function Daylight() {
  const params = useDaylight((s) => s.params);
  const refresh = useDaylight((s) => s.refresh);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);
  return (
    <>
      <color attach="background" args={[params.sky]} />
      <ambientLight intensity={params.ambient} />
      <hemisphereLight args={["#ffffff", "#c9c2b2", params.hemi]} />
      <directionalLight
        position={[12, 20, 8]}
        intensity={params.dirI}
        color={params.dir}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-radius={4}
        shadow-normalBias={0.02}
        shadow-bias={-0.0002}
      />
      {/* Iliq qaytaruvchi nur (pol/devordan aks — CG "yassi" ko'rinishni yumshatadi) */}
      <directionalLight position={[-10, 6, -8]} intensity={params.dirI * 0.2} color="#ffe6c4" />
    </>
  );
}

export default function Room({ mode }: { mode: CameraMode }) {
  const { W, D, WH } = ROOM;
  const fpv = mode === "fpv";
  const floorColor = useLayout((s) => s.floorColor);
  const wallColor = useLayout((s) => s.wallColor);
  const wallMat = wallColor ?? "#dcd3c2";
  // Yon devorlar biroz to'qroq (chuqurlik hissi) — mavzu rangidan hosila.
  const sideWall = wallColor ? shade(wallColor, -10) : "#d2c9b7";
  // Yaqin devorlar — uzoq devor bilan BIR XIL balandlik. Iso'da yarim-shaffof
  // (ichi ko'rinib tursin), FPV'da to'liq qattiq/zich.
  const nearOpacity = fpv ? 1 : 0.2;
  const nearTransparent = !fpv;

  return (
    <group>
      {/* Yorug'lik — kun/tun sikliga bog'liq (Daylight). Soya-kamerasi butun
          xonani qamraydi (x=±23, z=±16 dan tashqaridagi mebel ham soya beradi). */}
      <Daylight />

      {/* Pol — z-fight bo'lmasin uchun markaziy zona polygonOffset bilan */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#e9e2d2" roughness={0.68} metalness={0.04} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
        <planeGeometry args={[30, 14]} />
        <meshStandardMaterial color={floorColor ?? "#d8c7a8"} roughness={0.6} metalness={0.05} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>

      {/* ── Perimetr devorlar (yopiq bino) ── */}
      {/* Uzoq devorlar — doim ko'rinadi */}
      <mesh position={[0, WH / 2, -D / 2]} receiveShadow>
        <boxGeometry args={[W, WH, 0.3]} />
        <meshStandardMaterial color={wallMat} roughness={1} />
      </mesh>
      <mesh position={[-W / 2, WH / 2, 0]} receiveShadow>
        <boxGeometry args={[0.3, WH, D]} />
        <meshStandardMaterial color={sideWall} roughness={1} />
      </mesh>
      {/* Yaqin devorlar — 4 tomon BIR XIL balandlik. Iso'da yarim-shaffof. */}
      <mesh position={[0, WH / 2, D / 2]} receiveShadow>
        <boxGeometry args={[W, WH, 0.3]} />
        <meshStandardMaterial color={wallMat} roughness={1} transparent={nearTransparent} opacity={nearOpacity} depthWrite={fpv} />
      </mesh>
      <mesh position={[W / 2, WH / 2, 0]} receiveShadow>
        <boxGeometry args={[0.3, WH, D]} />
        <meshStandardMaterial color={sideWall} roughness={1} transparent={nearTransparent} opacity={nearOpacity} depthWrite={fpv} />
      </mesh>

      {/* Shift — faqat FPV (ichki ko'rinish yopiq bo'lsin) */}
      <mesh position={[0, WH, 0]} rotation={[Math.PI / 2, 0, 0]} visible={fpv}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#eae4d6" roughness={1} side={2} />
      </mesh>
    </group>
  );
}
