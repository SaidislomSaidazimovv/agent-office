import { useMemo } from "react";
import type { JSX } from "react";

// ── Ko'p-xonali low-poly ofis (Pixel Agents kabi) ────────────
// Qattiq devorlar bilan ajratilган xonalar (eshik teshiklари bilan), har
// xonaning o'z pol rangi. Hammasi qutı/silindr/konus — yengil, tez.
// Xona reja (x[-16,16], z[-13,13]):
//   burchaklarда 4 yopiq xona + markazда ochiq ish maydoni.

type V3 = [number, number, number];
const M = (color: string, rough = 0.9) => <meshStandardMaterial color={color} roughness={rough} />;

const WALL_H = 2.5;
const WALL_T = 0.24;
const WALL_C = "#cabfad";

function Box({ p, s, c, rough = 0.9 }: { p: V3; s: V3; c: string; rough?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      {M(c, rough)}
    </mesh>
  );
}

// Pol rangi (xona uchun)
function Floor({ x0, x1, z0, z1, c }: { x0: number; x1: number; z0: number; z1: number; c: string }) {
  return (
    <mesh position={[(x0 + x1) / 2, 0.02, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[x1 - x0, z1 - z0]} />
      {M(c, 1)}
    </mesh>
  );
}

const DOORW = "#8a6f52";
const FRAME = "#6d5741";

// Devor X o'qi bo'ylab (o'rtada eshik — ramka + ochiq tavaqa)
function WallX({ x0, x1, z, door = 2 }: { x0: number; x1: number; z: number; door?: number }) {
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const seg = Math.max(0.01, (len - door) / 2);
  return (
    <group>
      <Box p={[cx - (door / 2 + seg / 2), WALL_H / 2, z]} s={[seg, WALL_H, WALL_T]} c={WALL_C} />
      <Box p={[cx + (door / 2 + seg / 2), WALL_H / 2, z]} s={[seg, WALL_H, WALL_T]} c={WALL_C} />
      <Box p={[cx, WALL_H - 0.15, z]} s={[door, 0.3, WALL_T]} c={WALL_C} />
      {/* ramka */}
      <Box p={[cx - door / 2, (WALL_H - 0.3) / 2, z]} s={[0.1, WALL_H - 0.3, WALL_T + 0.06]} c={FRAME} />
      <Box p={[cx + door / 2, (WALL_H - 0.3) / 2, z]} s={[0.1, WALL_H - 0.3, WALL_T + 0.06]} c={FRAME} />
      {/* ochiq tavaqa (menta ilinган) */}
      <group position={[cx - door / 2, (WALL_H - 0.3) / 2, z]} rotation={[0, -1.25, 0]}>
        <mesh position={[door * 0.42, 0, 0]} castShadow>
          <boxGeometry args={[door * 0.82, WALL_H - 0.36, 0.06]} />
          <meshStandardMaterial color={DOORW} roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

// Devor Z o'qi bo'ylab
function WallZ({ z0, z1, x, door = 2 }: { z0: number; z1: number; x: number; door?: number }) {
  const len = z1 - z0;
  const cz = (z0 + z1) / 2;
  const seg = Math.max(0.01, (len - door) / 2);
  return (
    <group>
      <Box p={[x, WALL_H / 2, cz - (door / 2 + seg / 2)]} s={[WALL_T, WALL_H, seg]} c={WALL_C} />
      <Box p={[x, WALL_H / 2, cz + (door / 2 + seg / 2)]} s={[WALL_T, WALL_H, seg]} c={WALL_C} />
      <Box p={[x, WALL_H - 0.15, cz]} s={[WALL_T, 0.3, door]} c={WALL_C} />
      <Box p={[x, (WALL_H - 0.3) / 2, cz - door / 2]} s={[WALL_T + 0.06, WALL_H - 0.3, 0.1]} c={FRAME} />
      <Box p={[x, (WALL_H - 0.3) / 2, cz + door / 2]} s={[WALL_T + 0.06, WALL_H - 0.3, 0.1]} c={FRAME} />
      <group position={[x, (WALL_H - 0.3) / 2, cz - door / 2]} rotation={[0, 1.25, 0]}>
        <mesh position={[0, 0, door * 0.42]} castShadow>
          <boxGeometry args={[0.06, WALL_H - 0.36, door * 0.82]} />
          <meshStandardMaterial color={DOORW} roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

// Nom yorlig'i (xona ustida — pol tekisligida yozuv o'rniga oddiy plita)
function RoomSign({ p, c }: { p: V3; c: string }) {
  return <Box p={p} s={[1.6, 0.05, 0.5]} c={c} rough={0.5} />;
}

// ── Jihozlar (low-poly) ──
function Plant({ p, scale = 1 }: { p: V3; scale?: number }) {
  return (
    <group position={p} scale={scale}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.17, 0.4, 10]} />
        {M("#b5643c")}
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.12, 0.75, Math.sin(a) * 0.12]} rotation={[Math.sin(a) * 0.5, 0, Math.cos(a) * -0.5]} castShadow>
            <coneGeometry args={[0.16, 0.8, 5]} />
            {M(i % 2 ? "#4a8a52" : "#3c7444")}
          </mesh>
        );
      })}
      <mesh position={[0, 1.0, 0]} castShadow>
        <coneGeometry args={[0.18, 0.7, 5]} />
        {M("#579a5e")}
      </mesh>
    </group>
  );
}

function Sofa({ p, ry = 0, c = "#4a5568" }: { p: V3; ry?: number; c?: string }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Box p={[0, 0.25, 0]} s={[2.2, 0.3, 0.9]} c={c} />
      <Box p={[0, 0.6, -0.4]} s={[2.2, 0.6, 0.2]} c={c} />
      <Box p={[-1.05, 0.5, 0]} s={[0.2, 0.5, 0.9]} c={c} />
      <Box p={[1.05, 0.5, 0]} s={[0.2, 0.5, 0.9]} c={c} />
      {[-0.55, 0.55].map((x) => <Box key={x} p={[x, 0.44, 0.05]} s={[0.95, 0.16, 0.7]} c="#5a6678" />)}
    </group>
  );
}

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

function MeetingTable({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[1.1, 1.1, 0.09, 20]} />
        {M("#7a6349")}
      </mesh>
      <mesh position={[0, 0.36, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.28, 0.7, 10]} />
        {M("#4a3a2a")}
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <group key={i} position={[Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5]} rotation={[0, -a + Math.PI / 2, 0]}>
            <Box p={[0, 0.42, 0]} s={[0.42, 0.08, 0.42]} c="#3a3f48" />
            <Box p={[0, 0.68, -0.18]} s={[0.42, 0.44, 0.07]} c="#3a3f48" />
          </group>
        );
      })}
    </group>
  );
}

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

function WaterCooler({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Box p={[0, 0.45, 0]} s={[0.4, 0.9, 0.4]} c="#e8ecf0" />
      <mesh position={[0, 1.1, 0]} castShadow><cylinderGeometry args={[0.16, 0.2, 0.4, 10]} />{M("#5aa0e0", 0.4)}</mesh>
    </group>
  );
}

function Kitchen({ p, ry = 0 }: { p: V3; ry?: number }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Box p={[0, 0.45, 0]} s={[5, 0.9, 0.7]} c="#c9c0ae" />
      <Box p={[0, 0.92, 0]} s={[5.05, 0.06, 0.75]} c="#3a3f48" />
      <Box p={[-1.6, 0.93, 0]} s={[0.7, 0.04, 0.5]} c="#5a6270" />
      {[-0.4, 0.4, 1.2, 2.0].map((x) => <Box key={x} p={[x, 0.45, 0.34]} s={[0.7, 0.7, 0.02]} c="#b8ae9a" />)}
      <Box p={[2.9, 0.95, 0]} s={[0.75, 1.9, 0.7]} c="#dfe3e8" />
      <Box p={[2.9, 0.95, 0.36]} s={[0.05, 0.6, 0.03]} c="#9aa0a8" />
    </group>
  );
}

function Whiteboard({ p, ry = 0 }: { p: V3; ry?: number }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Box p={[0, 1.4, 0]} s={[1.8, 1.05, 0.06]} c="#f4f4ee" rough={0.6} />
      <mesh position={[-0.4, 1.55, 0.05]}><boxGeometry args={[0.5, 0.03, 0.01]} /><meshStandardMaterial color="#3d7dd6" /></mesh>
      <mesh position={[0.2, 1.35, 0.05]}><boxGeometry args={[0.7, 0.03, 0.01]} /><meshStandardMaterial color="#33a852" /></mesh>
    </group>
  );
}

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
      <group position={[0, 0, 0.6]}>
        <Box p={[0, 0.46, 0]} s={[0.48, 0.08, 0.48]} c="#454b55" />
        <Box p={[0, 0.74, 0.22]} s={[0.48, 0.46, 0.08]} c="#454b55" />
      </group>
    </group>
  );
}

// Devor rasmi
function Painting({ p, ry = 0, c }: { p: V3; ry?: number; c: string }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Box p={[0, 0, 0]} s={[1.1, 0.8, 0.06]} c="#3a2e22" rough={0.6} />
      <mesh position={[0, 0, 0.04]}><planeGeometry args={[0.9, 0.6]} /><meshBasicMaterial color={c} /></mesh>
    </group>
  );
}

// Devorга osilган TV
function TV({ p, ry = 0 }: { p: V3; ry?: number }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Box p={[0, 0, 0]} s={[2, 1.15, 0.08]} c="#15181d" rough={0.4} />
      <mesh position={[0, 0, 0.05]}><planeGeometry args={[1.85, 1.0]} /><meshBasicMaterial color="#1b3a5c" /></mesh>
    </group>
  );
}

// Printer
function Printer({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Box p={[0, 0.55, 0]} s={[0.7, 0.5, 0.6]} c="#3a3f48" />
      <Box p={[0, 0.82, 0]} s={[0.72, 0.08, 0.5]} c="#2a2e35" />
      <Box p={[0, 0.5, 0.31]} s={[0.5, 0.1, 0.04]} c="#5a6270" />
    </group>
  );
}

// Yerдаги lampa
function StandingLamp({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.2, 0.22, 0.08, 12]} />{M("#3a3f48")}</mesh>
      <mesh position={[0, 0.9, 0]}><cylinderGeometry args={[0.025, 0.025, 1.7, 8]} />{M("#6a6f78", 0.4)}</mesh>
      <mesh position={[0, 1.75, 0]}><coneGeometry args={[0.28, 0.35, 12, 1, true]} /><meshStandardMaterial color="#f0e6c8" emissive="#fff0c0" emissiveIntensity={0.5} side={2} /></mesh>
    </group>
  );
}

export default function OfficeDecor() {
  return (
    <group>
      {/* ══ OSHXONA (yuqori-chap burchak) ══ */}
      <Floor x0={-16} x1={-8} z0={-13} z1={-7} c="#d3d7d3" />
      <WallZ x={-8} z0={-13} z1={-7} door={2} />
      <WallX z={-7} x0={-16} x1={-8} door={2} />
      <Kitchen p={[-12, 0, -12]} />
      <WaterCooler p={[-9, 0, -8.5]} />
      <RoomSign p={[-12, 2.7, -7]} c="#c9a24c" />

      {/* ══ MAJLIS XONASI (yuqori-o'ng burchak) ══ */}
      <Floor x0={8} x1={16} z0={-13} z1={-7} c="#cdd6df" />
      <WallZ x={8} z0={-13} z1={-7} door={2} />
      <WallX z={-7} x0={8} x1={16} door={2} />
      <MeetingTable p={[12, 0, -10]} />
      <Whiteboard p={[12, 0, -12.7]} />
      <RoomSign p={[12, 2.7, -7]} c="#3d7dd6" />

      {/* ══ FOKUS-XONA (past-chap burchak) ══ */}
      <Floor x0={-16} x1={-9} z0={7} z1={13} c="#cdd8cd" />
      <WallZ x={-9} z0={7} z1={13} door={2} />
      <WallX z={7} x0={-16} x1={-9} door={2} />
      <EmptyDesk p={[-12.5, 0, 8.5]} ry={Math.PI} />
      <Bookshelf p={[-15.3, 0, 11]} ry={Math.PI / 2} />
      <Plant p={[-10, 0, 12]} scale={1.0} />
      <RoomSign p={[-12.5, 2.7, 7]} c="#27ae60" />

      {/* ══ DAM OLISH (past-o'ng burchak) ══ */}
      <Floor x0={8} x1={16} z0={7} z1={13} c="#ddd0b8" />
      <WallZ x={8} z0={7} z1={13} door={2} />
      <WallX z={7} x0={8} x1={16} door={2} />
      <Sofa p={[12, 0, 12]} ry={Math.PI} c="#4a5568" />
      <Sofa p={[15, 0, 10]} ry={-Math.PI / 2} c="#556070" />
      <CoffeeTable p={[12.5, 0, 10]} />
      <Plant p={[9.2, 0, 12.2]} scale={1.1} />
      <RoomSign p={[12, 2.7, 7]} c="#e08a3c" />

      {/* ══ MARKAZ — ochiq ish maydoni ══ */}
      {/* Reception (old-markaz) */}
      <group position={[0, 0, 11]}>
        <Box p={[0, 0.55, 0]} s={[3, 1.1, 0.8]} c="#6d5741" />
        <Box p={[0, 1.12, 0]} s={[3.2, 0.06, 1]} c="#8a6f52" />
      </group>
      <Plant p={[-3, 0, 11.5]} scale={1.1} />
      <Plant p={[3, 0, 11.5]} scale={1.1} />

      {/* Qo'shimcha ish stollari (markaz chetlarида) */}
      <EmptyDesk p={[-1.5, 0, -10]} ry={0} />
      <EmptyDesk p={[1.5, 0, -10]} ry={0} />
      <EmptyDesk p={[0, 0, 6.5]} ry={Math.PI} />

      {/* Tumbalar + printer + lampalar */}
      <Bookshelf p={[-15.4, 0, 0]} ry={Math.PI / 2} />
      <Bookshelf p={[15.4, 0, 0]} ry={-Math.PI / 2} />
      <Printer p={[-3.5, 0, -6]} />
      <StandingLamp p={[4, 0, -6]} />
      <StandingLamp p={[-6, 0, 6.5]} />
      <Plant p={[-7.5, 0, -2]} scale={1.0} />
      <Plant p={[7.5, 0, 2]} scale={1.0} />
      <Plant p={[6, 0, -6]} scale={0.9} />

      {/* Devor rasmlari (perimetr devorlarда) */}
      <Painting p={[-4, 1.7, -12.85]} c="#c85a3c" />
      <Painting p={[4, 1.7, -12.85]} c="#3a7bc8" />
      <Painting p={[-15.85, 1.7, 2]} ry={Math.PI / 2} c="#4a9a5a" />
      <Painting p={[15.85, 1.7, -2]} ry={-Math.PI / 2} c="#c8a03c" />

      {/* Majlis xonasida TV, dam olishда TV */}
      <TV p={[15.7, 1.6, -10]} ry={-Math.PI / 2} />
      <TV p={[9.5, 1.6, 12.7]} />
    </group>
  );
}
