import { useMemo } from "react";
import type { JSX } from "react";

// ── Katta ofisni to'ldiruvchi low-poly jihozlar (flat, yengil) ──
// Hammasi qutı/silindr/konus — teksturasiz, tez. Majlis xonasi, oshxona,
// dam olish zonasi, qo'shimcha stollar, javonlar, o'simliklar.

type V3 = [number, number, number];
const M = (color: string, rough = 0.85) => <meshStandardMaterial color={color} roughness={rough} />;

function Box({ p, s, c, rough = 0.85 }: { p: V3; s: V3; c: string; rough?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      {M(c, rough)}
    </mesh>
  );
}

// O'simlik — tuvak + barglar
function Plant({ p, scale = 1 }: { p: V3; scale?: number }) {
  return (
    <group position={p} scale={scale}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.17, 0.4, 12]} />
        {M("#b5643c")}
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.12, 0.75, Math.sin(a) * 0.12]} rotation={[Math.sin(a) * 0.5, 0, Math.cos(a) * -0.5]} castShadow>
            <coneGeometry args={[0.16, 0.8, 6]} />
            {M(i % 2 ? "#4a8a52" : "#3c7444")}
          </mesh>
        );
      })}
      <mesh position={[0, 1.0, 0]} castShadow>
        <coneGeometry args={[0.18, 0.7, 6]} />
        {M("#579a5e")}
      </mesh>
    </group>
  );
}

// Divan
function Sofa({ p, ry = 0, c = "#4a5568" }: { p: V3; ry?: number; c?: string }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Box p={[0, 0.25, 0]} s={[2.2, 0.3, 0.9]} c={c} />
      <Box p={[0, 0.6, -0.4]} s={[2.2, 0.6, 0.2]} c={c} />
      <Box p={[-1.05, 0.5, 0]} s={[0.2, 0.5, 0.9]} c={c} />
      <Box p={[1.05, 0.5, 0]} s={[0.2, 0.5, 0.9]} c={c} />
      {[-0.55, 0.55].map((x) => <Box key={x} p={[x, 0.44, 0.05]} s={[0.95, 0.16, 0.7]} c="#5a6678" rough={0.95} />)}
    </group>
  );
}

// Past stol (kofe)
function CoffeeTable({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Box p={[0, 0.35, 0]} s={[1.1, 0.08, 0.6]} c="#6d5741" />
      {[[-0.48, -0.23], [0.48, -0.23], [-0.48, 0.23], [0.48, 0.23]].map(([x, z], i) => (
        <Box key={i} p={[x, 0.17, z]} s={[0.06, 0.34, 0.06]} c="#4a3a2a" />
      ))}
    </group>
  );
}

// Yumaloq majlis stoli + stullar
function MeetingTable({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[1.1, 1.1, 0.09, 24]} />
        {M("#7a6349")}
      </mesh>
      <mesh position={[0, 0.36, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.28, 0.7, 12]} />
        {M("#4a3a2a")}
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2;
        const x = Math.cos(a) * 1.5;
        const z = Math.sin(a) * 1.5;
        return (
          <group key={i} position={[x, 0, z]} rotation={[0, -a + Math.PI / 2, 0]}>
            <Box p={[0, 0.42, 0]} s={[0.42, 0.08, 0.42]} c="#3a3f48" />
            <Box p={[0, 0.68, -0.18]} s={[0.42, 0.44, 0.07]} c="#3a3f48" />
            <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.04, 0.05, 0.4, 8]} />{M("#555b66")}</mesh>
          </group>
        );
      })}
    </group>
  );
}

// Kitob javoni (rangli kitoblar bilan)
function Bookshelf({ p, ry = 0 }: { p: V3; ry?: number }) {
  const books = useMemo(() => {
    const cols = ["#c0392b", "#2980b9", "#27ae60", "#e67e22", "#8e44ad", "#16a085", "#c99a2e"];
    const rows: JSX.Element[] = [];
    for (let shelf = 0; shelf < 3; shelf++) {
      let x = -0.5;
      let k = 0;
      while (x < 0.5) {
        const w = 0.05 + ((shelf * 7 + k) % 4) * 0.02;
        const h = 0.28 + ((shelf * 3 + k) % 3) * 0.05;
        rows.push(<Box key={`${shelf}-${k}`} p={[x + w / 2, 0.45 + shelf * 0.55 + h / 2, 0.02]} s={[w, h, 0.22]} c={cols[(shelf * 5 + k) % cols.length]} rough={0.7} />);
        x += w + 0.012;
        k++;
      }
    }
    return rows;
  }, []);
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Box p={[0, 1.05, 0]} s={[1.2, 2.1, 0.35]} c="#5a4634" />
      <Box p={[0, 1.05, 0.02]} s={[1.1, 2.0, 0.3]} c="#3a2e22" />
      {[0.42, 0.97, 1.52].map((y) => <Box key={y} p={[0, y, 0.03]} s={[1.1, 0.04, 0.3]} c="#4a3a2a" />)}
      {books}
    </group>
  );
}

// Shkaf/tumba
function Cabinet({ p, ry = 0, c = "#8a7a66" }: { p: V3; ry?: number; c?: string }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Box p={[0, 0.45, 0]} s={[1.3, 0.9, 0.5]} c={c} />
      {[0.28, 0.62].map((y) => <Box key={y} p={[0, y, 0.26]} s={[1.2, 0.28, 0.03]} c="#9d8d78" />)}
      {[-0.3, 0.3].map((x) => [0.28, 0.62].map((y) => <mesh key={`${x}-${y}`} position={[x, y, 0.28]}><sphereGeometry args={[0.03, 8, 8]} />{M("#3a3228")}</mesh>))}
    </group>
  );
}

// Suv sovutgich
function WaterCooler({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Box p={[0, 0.45, 0]} s={[0.4, 0.9, 0.4]} c="#e8ecf0" />
      <mesh position={[0, 1.1, 0]} castShadow><cylinderGeometry args={[0.16, 0.2, 0.4, 12]} />{M("#5aa0e0", 0.4)}</mesh>
    </group>
  );
}

// Oshxona bloki (peshtaxta + shkaflar + muzlatgich)
function Kitchen({ p, ry = 0 }: { p: V3; ry?: number }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Box p={[0, 0.45, 0]} s={[5, 0.9, 0.7]} c="#c9c0ae" />
      <Box p={[0, 0.92, 0]} s={[5.05, 0.06, 0.75]} c="#3a3f48" />
      <Box p={[-1.6, 0.93, 0]} s={[0.7, 0.04, 0.5]} c="#5a6270" />{/* rakovina */}
      {[-0.4, 0.4, 1.2, 2.0].map((x) => <Box key={x} p={[x, 0.45, 0.34]} s={[0.7, 0.7, 0.02]} c="#b8ae9a" />)}
      <mesh position={[0.3, 1.05, 0]}><cylinderGeometry args={[0.03, 0.03, 0.28, 8]} />{M("#8a8f98", 0.4)}</mesh>{/* jo'mrak */}
      {/* Muzlatgich */}
      <Box p={[2.9, 0.95, 0]} s={[0.75, 1.9, 0.7]} c="#dfe3e8" />
      <Box p={[2.9, 0.95, 0.36]} s={[0.05, 0.6, 0.03]} c="#9aa0a8" />
    </group>
  );
}

// Doska
function Whiteboard({ p, ry = 0 }: { p: V3; ry?: number }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Box p={[0, 1.2, 0]} s={[1.8, 1.1, 0.05]} c="#f4f4ee" rough={0.6} />
      <Box p={[0, 1.2, -0.03]} s={[1.9, 1.2, 0.03]} c="#8a8f98" />
      {[-0.5, 0.5].map((x) => <Box key={x} p={[x, 0.35, 0]} s={[0.05, 0.7, 0.05]} c="#6a6f78" />)}
      <mesh position={[-0.4, 1.35, 0.04]}><boxGeometry args={[0.5, 0.03, 0.01]} /><meshStandardMaterial color="#3d7dd6" /></mesh>
      <mesh position={[0.2, 1.15, 0.04]}><boxGeometry args={[0.7, 0.03, 0.01]} /><meshStandardMaterial color="#33a852" /></mesh>
    </group>
  );
}

// Bo'sh dekorativ ish stoli (monitor o'chiq)
function EmptyDesk({ p, ry = 0 }: { p: V3; ry?: number }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Box p={[0, 0.72, 0]} s={[1.4, 0.08, 0.75]} c="#8a6f52" />
      {[-0.62, 0.62].map((x) => <Box key={x} p={[x, 0.36, 0]} s={[0.08, 0.72, 0.68]} c="#6d5741" />)}
      <group position={[0, 0.76, -0.2]}>
        <Box p={[0, 0.24, 0]} s={[0.62, 0.4, 0.05]} c="#1a1d22" rough={0.5} />
        <mesh position={[0, 0.24, -0.03]}><planeGeometry args={[0.54, 0.32]} /><meshBasicMaterial color="#2a3038" /></mesh>
        <Box p={[0, 0.03, 0]} s={[0.08, 0.14, 0.08]} c="#23262b" />
      </group>
      <Box p={[0, 0.77, 0.14]} s={[0.46, 0.03, 0.16]} c="#2a2e35" />
      {/* stul */}
      <group position={[0, 0, 0.6]}>
        <Box p={[0, 0.46, 0]} s={[0.48, 0.08, 0.48]} c="#454b55" />
        <Box p={[0, 0.74, 0.22]} s={[0.48, 0.46, 0.08]} c="#454b55" />
      </group>
    </group>
  );
}

// Gilam
function Rug({ p, s, c }: { p: [number, number]; s: [number, number]; c: string }) {
  return (
    <mesh position={[p[0], 0.02, p[1]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={s} />
      {M(c, 1)}
    </mesh>
  );
}

export default function OfficeDecor() {
  return (
    <group>
      {/* ── Majlis xonasi (orqa-chap) ── */}
      <Rug p={[-9.5, -8]} s={[6, 6]} c="#cdd6df" />
      <MeetingTable p={[-9.5, 0, -8]} />
      <Whiteboard p={[-9.5, 0, -11.6]} />
      <Plant p={[-12.5, 0, -11]} scale={1.1} />

      {/* ── Oshxona / dam olish (orqa-o'ng) ── */}
      <Kitchen p={[8.5, 0, -12]} />
      <WaterCooler p={[13.5, 0, -10]} />
      <Cabinet p={[13.6, 0, -6.5]} ry={-Math.PI / 2} />

      {/* ── Reception (old-chap) ── */}
      <group position={[-10, 0, 9]}>
        <Box p={[0, 0.55, 0]} s={[3, 1.1, 0.8]} c="#6d5741" />
        <Box p={[0, 1.12, 0]} s={[3.2, 0.06, 1]} c="#8a6f52" />
        <Box p={[0, 0.9, 0.2]} s={[3, 0.5, 0.05]} c="#7a5f45" />
      </group>
      <Plant p={[-12.5, 0, 11]} scale={1.3} />
      <Plant p={[-7, 0, 11.4]} scale={1.0} />

      {/* ── Dam olish zonasi (old-o'ng) ── */}
      <Rug p={[8, 9]} s={[7, 6]} c="#d8cab0" />
      <Sofa p={[8, 0, 11]} ry={Math.PI} c="#4a5568" />
      <Sofa p={[11, 0, 9]} ry={-Math.PI / 2} c="#556070" />
      <CoffeeTable p={[8, 0, 9]} />
      <Plant p={[4.5, 0, 11.5]} scale={1.2} />
      <Plant p={[12.5, 0, 12]} scale={1.1} />

      {/* ── Qo'shimcha ish stollari (chap qanot, 2×2 pod) ── */}
      {[-13, -11].map((x) =>
        [-2, 1].map((z, j) => <EmptyDesk key={`L${x}${z}`} p={[x, 0, z]} ry={x < -12 ? Math.PI / 2 : -Math.PI / 2} />),
      )}

      {/* ── Qo'shimcha ish stollari (o'ng qanot) ── */}
      {[11, 13].map((x) =>
        [2, 5].map((z) => <EmptyDesk key={`R${x}${z}`} p={[x, 0, z]} ry={x > 12 ? -Math.PI / 2 : Math.PI / 2} />),
      )}

      {/* ── Devor bo'yi javonlar + o'simliklar ── */}
      <Bookshelf p={[-15.4, 0, -3]} ry={Math.PI / 2} />
      <Bookshelf p={[-15.4, 0, 3]} ry={Math.PI / 2} />
      <Cabinet p={[-15.2, 0, 6]} ry={Math.PI / 2} />
      <Plant p={[15, 0, -2]} scale={1.2} />
      <Plant p={[15, 0, 6]} scale={1.0} />
      <Plant p={[0, 0, -12.4]} scale={1.1} />
      <Plant p={[-3, 0, 12]} scale={0.9} />
    </group>
  );
}
