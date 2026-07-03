import { useMemo } from "react";
import type { JSX } from "react";

// ── Katta ko'p-xonali ofis (server/xojatxona/kutubxona/shisha) ──
// Hammasi qutı/silindr/konus — yengil. Xona: x[-23,23], z[-16,16].

type V3 = [number, number, number];
const M = (color: string, rough = 0.9) => <meshStandardMaterial color={color} roughness={rough} />;
const WALL_H = 2.6;
const WALL_T = 0.24;
const WALL_C = "#cabfad";
const DOORW = "#8a6f52";
const FRAME = "#6d5741";

function Box({ p, s, c, rough = 0.9 }: { p: V3; s: V3; c: string; rough?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      {M(c, rough)}
    </mesh>
  );
}

function Floor({ x0, x1, z0, z1, c }: { x0: number; x1: number; z0: number; z1: number; c: string }) {
  return (
    <mesh position={[(x0 + x1) / 2, 0.02, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[x1 - x0, z1 - z0]} />
      {M(c, 1)}
    </mesh>
  );
}

// Devor (X bo'ylab) — eshik + ramka + tavaqa
function WallX({ x0, x1, z, door = 2 }: { x0: number; x1: number; z: number; door?: number }) {
  const cx = (x0 + x1) / 2;
  const seg = Math.max(0.01, (x1 - x0 - door) / 2);
  return (
    <group>
      <Box p={[cx - (door / 2 + seg / 2), WALL_H / 2, z]} s={[seg, WALL_H, WALL_T]} c={WALL_C} />
      <Box p={[cx + (door / 2 + seg / 2), WALL_H / 2, z]} s={[seg, WALL_H, WALL_T]} c={WALL_C} />
      <Box p={[cx, WALL_H - 0.15, z]} s={[door, 0.3, WALL_T]} c={WALL_C} />
      <Box p={[cx - door / 2, (WALL_H - 0.3) / 2, z]} s={[0.1, WALL_H - 0.3, WALL_T + 0.06]} c={FRAME} />
      <Box p={[cx + door / 2, (WALL_H - 0.3) / 2, z]} s={[0.1, WALL_H - 0.3, WALL_T + 0.06]} c={FRAME} />
      <group position={[cx - door / 2, (WALL_H - 0.3) / 2, z]} rotation={[0, -1.25, 0]}>
        <mesh position={[door * 0.42, 0, 0]} castShadow>
          <boxGeometry args={[door * 0.82, WALL_H - 0.36, 0.06]} />
          <meshStandardMaterial color={DOORW} roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

// Bo'luvchi devor (X qat'iy, eshiksiz)
function DividerZ({ x, z0, z1 }: { x: number; z0: number; z1: number }) {
  return <Box p={[x, WALL_H / 2, (z0 + z1) / 2]} s={[WALL_T, WALL_H, z1 - z0]} c={WALL_C} />;
}

// Shisha devor (X bo'ylab, eshik teshigи bilan)
function GlassPanel({ p, s }: { p: V3; s: V3 }) {
  return (
    <group position={p}>
      <mesh>
        <boxGeometry args={s} />
        <meshStandardMaterial color="#bfe0ff" transparent opacity={0.16} roughness={0.08} metalness={0.1} />
      </mesh>
      <Box p={[0, s[1] / 2 - 0.03, 0]} s={[s[0] + 0.02, 0.06, s[2] + 0.02]} c={FRAME} />
    </group>
  );
}
function GlassWallX({ x0, x1, z, door = 2 }: { x0: number; x1: number; z: number; door?: number }) {
  const cx = (x0 + x1) / 2;
  const seg = Math.max(0.01, (x1 - x0 - door) / 2);
  return (
    <group>
      <GlassPanel p={[cx - (door / 2 + seg / 2), WALL_H / 2, z]} s={[seg, WALL_H, 0.08]} />
      <GlassPanel p={[cx + (door / 2 + seg / 2), WALL_H / 2, z]} s={[seg, WALL_H, 0.08]} />
      <Box p={[cx - door / 2, (WALL_H - 0.3) / 2, z]} s={[0.1, WALL_H - 0.3, 0.14]} c={FRAME} />
      <Box p={[cx + door / 2, (WALL_H - 0.3) / 2, z]} s={[0.1, WALL_H - 0.3, 0.14]} c={FRAME} />
    </group>
  );
}

// ── Jihozlar ──
function Plant({ p, scale = 1 }: { p: V3; scale?: number }) {
  return (
    <group position={p} scale={scale}>
      <mesh position={[0, 0.2, 0]} castShadow><cylinderGeometry args={[0.22, 0.17, 0.4, 10]} />{M("#b5643c")}</mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return <mesh key={i} position={[Math.cos(a) * 0.12, 0.75, Math.sin(a) * 0.12]} rotation={[Math.sin(a) * 0.5, 0, Math.cos(a) * -0.5]} castShadow><coneGeometry args={[0.16, 0.8, 5]} />{M(i % 2 ? "#4a8a52" : "#3c7444")}</mesh>;
      })}
      <mesh position={[0, 1.0, 0]} castShadow><coneGeometry args={[0.18, 0.7, 5]} />{M("#579a5e")}</mesh>
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
    </group>
  );
}
function CoffeeTable({ p }: { p: V3 }) {
  return <group position={p}><Box p={[0, 0.35, 0]} s={[1.1, 0.08, 0.6]} c="#6d5741" />{[[-0.48, -0.23], [0.48, -0.23], [-0.48, 0.23], [0.48, 0.23]].map(([x, z], i) => <Box key={i} p={[x, 0.17, z]} s={[0.06, 0.34, 0.06]} c="#4a3a2a" />)}</group>;
}
function MeetingTable({ p, r = 1.1 }: { p: V3; r?: number }) {
  return (
    <group position={p}>
      <mesh position={[0, 0.72, 0]} castShadow><cylinderGeometry args={[r, r, 0.09, 20]} />{M("#7a6349")}</mesh>
      <mesh position={[0, 0.36, 0]} castShadow><cylinderGeometry args={[0.12, 0.28, 0.7, 10]} />{M("#4a3a2a")}</mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2;
        return <group key={i} position={[Math.cos(a) * (r + 0.4), 0, Math.sin(a) * (r + 0.4)]} rotation={[0, -a + Math.PI / 2, 0]}><Box p={[0, 0.42, 0]} s={[0.42, 0.08, 0.42]} c="#3a3f48" /><Box p={[0, 0.68, -0.18]} s={[0.42, 0.44, 0.07]} c="#3a3f48" /></group>;
      })}
    </group>
  );
}
function Bookshelf({ p, ry = 0 }: { p: V3; ry?: number }) {
  const books = useMemo(() => {
    const cols = ["#c0392b", "#2980b9", "#27ae60", "#e67e22", "#8e44ad", "#16a085", "#c99a2e"];
    const rows: JSX.Element[] = [];
    for (let shelf = 0; shelf < 4; shelf++) {
      let x = -0.5;
      let k = 0;
      while (x < 0.5) {
        const w = 0.05 + ((shelf * 7 + k) % 4) * 0.02;
        const h = 0.28 + ((shelf * 3 + k) % 3) * 0.05;
        rows.push(<Box key={`${shelf}-${k}`} p={[x + w / 2, 0.42 + shelf * 0.55 + h / 2, 0.02]} s={[w, h, 0.22]} c={cols[(shelf * 5 + k) % cols.length]} rough={0.7} />);
        x += w + 0.012;
        k++;
      }
    }
    return rows;
  }, []);
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Box p={[0, 1.3, 0]} s={[1.2, 2.6, 0.35]} c="#5a4634" />
      <Box p={[0, 1.3, 0.02]} s={[1.1, 2.5, 0.3]} c="#3a2e22" />
      {books}
    </group>
  );
}
function Kitchen({ p, ry = 0 }: { p: V3; ry?: number }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Box p={[0, 0.45, 0]} s={[5, 0.9, 0.7]} c="#c9c0ae" />
      <Box p={[0, 0.92, 0]} s={[5.05, 0.06, 0.75]} c="#3a3f48" />
      <Box p={[-1.6, 0.93, 0]} s={[0.7, 0.04, 0.5]} c="#5a6270" />
      <Box p={[2.9, 0.95, 0]} s={[0.75, 1.9, 0.7]} c="#dfe3e8" />
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
      <Box p={[0, 1.0, -0.2]} s={[0.62, 0.4, 0.05]} c="#1a1d22" rough={0.5} />
      <Box p={[0, 0.77, 0.14]} s={[0.46, 0.03, 0.16]} c="#2a2e35" />
      <group position={[0, 0, 0.6]}><Box p={[0, 0.46, 0]} s={[0.48, 0.08, 0.48]} c="#454b55" /><Box p={[0, 0.74, 0.22]} s={[0.48, 0.46, 0.08]} c="#454b55" /></group>
    </group>
  );
}
function Painting({ p, ry = 0, c }: { p: V3; ry?: number; c: string }) {
  return <group position={p} rotation={[0, ry, 0]}><Box p={[0, 0, 0]} s={[1.1, 0.8, 0.06]} c="#3a2e22" rough={0.6} /><mesh position={[0, 0, 0.04]}><planeGeometry args={[0.9, 0.6]} /><meshBasicMaterial color={c} /></mesh></group>;
}
function TV({ p, ry = 0 }: { p: V3; ry?: number }) {
  return <group position={p} rotation={[0, ry, 0]}><Box p={[0, 0, 0]} s={[2, 1.15, 0.08]} c="#15181d" rough={0.4} /><mesh position={[0, 0, 0.05]}><planeGeometry args={[1.85, 1.0]} /><meshBasicMaterial color="#1b3a5c" /></mesh></group>;
}
function StandingLamp({ p }: { p: V3 }) {
  return <group position={p}><mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.2, 0.22, 0.08, 12]} />{M("#3a3f48")}</mesh><mesh position={[0, 0.9, 0]}><cylinderGeometry args={[0.025, 0.025, 1.7, 8]} />{M("#6a6f78", 0.4)}</mesh><mesh position={[0, 1.75, 0]}><coneGeometry args={[0.28, 0.35, 12, 1, true]} /><meshStandardMaterial color="#f0e6c8" emissive="#fff0c0" emissiveIntensity={0.5} side={2} /></mesh></group>;
}

// ── YANGI: server rack ──
function ServerRack({ p, ry = 0 }: { p: V3; ry?: number }) {
  const lights = useMemo(() => {
    const out: JSX.Element[] = [];
    for (let i = 0; i < 8; i++) {
      out.push(<Box key={`s${i}`} p={[0, 0.35 + i * 0.2, 0.42]} s={[0.62, 0.14, 0.02]} c="#2a2e35" />);
      const col = ["#33d158", "#5aa0e0", "#33d158", "#ffd60a"][i % 4];
      out.push(<mesh key={`l${i}`} position={[0.24, 0.35 + i * 0.2, 0.44]}><boxGeometry args={[0.04, 0.04, 0.02]} /><meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.8} /></mesh>);
    }
    return out;
  }, []);
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Box p={[0, 1.1, 0]} s={[0.8, 2.2, 0.9]} c="#15181d" rough={0.5} />
      {lights}
    </group>
  );
}
function CoolingUnit({ p, ry = 0 }: { p: V3; ry?: number }) {
  return <group position={p} rotation={[0, ry, 0]}><Box p={[0, 0.8, 0]} s={[1.0, 1.6, 0.5]} c="#c4c8cc" />{[0.5, 0.9, 1.3].map((y) => <Box key={y} p={[0, y, 0.26]} s={[0.8, 0.1, 0.02]} c="#8a8f98" />)}</group>;
}

// ── YANGI: xojatxona ──
function Toilet({ p, ry = 0 }: { p: V3; ry?: number }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <mesh position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.22, 0.17, 0.42, 12]} />{M("#eef2f4", 0.4)}</mesh>
      <Box p={[0, 0.38, -0.28]} s={[0.42, 0.55, 0.16]} c="#eef2f4" />
      <mesh position={[0, 0.48, 0.02]}><cylinderGeometry args={[0.24, 0.24, 0.05, 12]} />{M("#e2e6e8", 0.4)}</mesh>
    </group>
  );
}
function Sink({ p, ry = 0 }: { p: V3; ry?: number }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Box p={[0, 0.42, 0]} s={[0.5, 0.16, 0.4]} c="#eef2f4" />
      <Box p={[0, 0.2, 0]} s={[0.1, 0.4, 0.1]} c="#dfe3e8" />
      <Box p={[0, 1.25, -0.16]} s={[0.5, 0.6, 0.03]} c="#a8c8d8" rough={0.2} />
    </group>
  );
}
function Stall({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Toilet p={[0, 0, 0]} />
      <Box p={[-0.75, 0.9, 0.2]} s={[0.06, 1.8, 1.6]} c="#c8d0d4" />
      <Box p={[0.75, 0.9, 0.2]} s={[0.06, 1.8, 1.6]} c="#c8d0d4" />
      <Box p={[0, 0.9, 1.0]} s={[1.5, 1.8, 0.06]} c="#c8d0d4" />
    </group>
  );
}

// ── YANGI: kutubxona o'qish stoli ──
function ReadingTable({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Box p={[0, 0.72, 0]} s={[2.2, 0.08, 1.0]} c="#7a6349" />
      {[[-0.95, -0.4], [0.95, -0.4], [-0.95, 0.4], [0.95, 0.4]].map(([x, z], i) => <Box key={i} p={[x, 0.36, z]} s={[0.08, 0.72, 0.08]} c="#4a3a2a" />)}
      {[[-0.6, -0.75], [0.6, -0.75], [-0.6, 0.75], [0.6, 0.75]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Box p={[0, 0.42, 0]} s={[0.4, 0.08, 0.4]} c="#3a3f48" />
          <Box p={[0, 0.66, z > 0 ? 0.16 : -0.16]} s={[0.4, 0.4, 0.07]} c="#3a3f48" />
        </group>
      ))}
    </group>
  );
}

export default function OfficeDecor() {
  return (
    <group>
      {/* ══════ YUQORI QATOR (z[-16,-9.5]) ══════ */}
      {/* Dividerlar */}
      {[-9, -1, 8, 15].map((x) => <DividerZ key={x} x={x} z0={-16} z1={-9.5} />)}

      {/* SERVER XONASI [-23,-9] */}
      <Floor x0={-23} x1={-9} z0={-16} z1={-9.5} c="#c6cace" />
      <WallX x0={-23} x1={-9} z={-9.5} door={2.6} />
      {[-21, -19, -17, -15, -13, -11].map((x) => <ServerRack key={x} p={[x, 0, -15]} />)}
      {[-21, -19, -17, -15, -13, -11].map((x) => <ServerRack key={`b${x}`} p={[x, 0, -11]} ry={Math.PI} />)}
      <CoolingUnit p={[-22, 0, -13]} ry={Math.PI / 2} />

      {/* OSHXONA [-9,-1] */}
      <Floor x0={-9} x1={-1} z0={-16} z1={-9.5} c="#d3d7d3" />
      <WallX x0={-9} x1={-1} z={-9.5} door={2} />
      <Kitchen p={[-5, 0, -15]} />

      {/* MAJLIS [-1,8] */}
      <Floor x0={-1} x1={8} z0={-16} z1={-9.5} c="#cdd6df" />
      <WallX x0={-1} x1={8} z={-9.5} door={2} />
      <MeetingTable p={[3.5, 0, -12.5]} />
      <Whiteboard p={[3.5, 0, -15.6]} />

      {/* XOJATXONA [8,15] */}
      <Floor x0={8} x1={15} z0={-16} z1={-9.5} c="#cfe0e6" />
      <WallX x0={8} x1={15} z={-9.5} door={2} />
      <Stall p={[9.8, 0, -15]} />
      <Stall p={[11.8, 0, -15]} />
      <Sink p={[13.6, 0, -15.5]} />
      <Sink p={[14.4, 0, -15.5]} />

      {/* SHISHA XONA A [15,23] */}
      <Floor x0={15} x1={23} z0={-16} z1={-9.5} c="#d8d2e0" />
      <GlassWallX x0={15} x1={23} z={-9.5} door={2} />
      <MeetingTable p={[19, 0, -12.8]} r={0.9} />

      {/* ══════ PAST QATOR (z[9.5,16]) ══════ */}
      {[-11, -3, 7, 15].map((x) => <DividerZ key={`b${x}`} x={x} z0={9.5} z1={16} />)}

      {/* KUTUBXONA [-23,-11] */}
      <Floor x0={-23} x1={-11} z0={9.5} z1={16} c="#d8cfc0" />
      <WallX x0={-23} x1={-11} z={9.5} door={2.4} />
      {[-21.5, -18.5, -15.5].map((x) => <Bookshelf key={x} p={[x, 0, 15]} />)}
      {[-21.5, -18.5, -15.5].map((x) => <Bookshelf key={`c${x}`} p={[x, 0, 11]} ry={Math.PI} />)}
      <ReadingTable p={[-13.5, 0, 13]} />

      {/* FOKUS [-11,-3] */}
      <Floor x0={-11} x1={-3} z0={9.5} z1={16} c="#cdd8cd" />
      <WallX x0={-11} x1={-3} z={9.5} door={2} />
      <EmptyDesk p={[-7, 0, 14.5]} ry={Math.PI} />
      <Plant p={[-4, 0, 15]} scale={1.0} />

      {/* DAM OLISH [-3,7] */}
      <Floor x0={-3} x1={7} z0={9.5} z1={16} c="#ddd0b8" />
      <WallX x0={-3} x1={7} z={9.5} door={2} />
      <Sofa p={[2, 0, 15]} c="#4a5568" />
      <Sofa p={[5.5, 0, 13]} ry={-Math.PI / 2} c="#556070" />
      <CoffeeTable p={[2, 0, 13]} />
      <TV p={[2, 1.7, 15.8]} />

      {/* SHISHA XONA B [7,15] — ofis */}
      <Floor x0={7} x1={15} z0={9.5} z1={16} c="#d8d2e0" />
      <GlassWallX x0={7} x1={15} z={9.5} door={2} />
      <EmptyDesk p={[9.5, 0, 14.5]} ry={Math.PI} />
      <EmptyDesk p={[12.5, 0, 14.5]} ry={Math.PI} />

      {/* SHISHA XONA C [15,23] — majlis */}
      <Floor x0={15} x1={23} z0={9.5} z1={16} c="#d8d2e0" />
      <GlassWallX x0={15} x1={23} z={9.5} door={2} />
      <MeetingTable p={[19, 0, 13]} r={0.9} />

      {/* ══════ MARKAZ — ochiq ish maydoni ══════ */}
      {/* Reception */}
      <group position={[0, 0, 7.5]}>
        <Box p={[0, 0.55, 0]} s={[3.2, 1.1, 0.8]} c="#6d5741" />
        <Box p={[0, 1.12, 0]} s={[3.4, 0.06, 1]} c="#8a6f52" />
      </group>
      {/* Qo'shimcha ish stollari */}
      <EmptyDesk p={[-13, 0, -3]} ry={Math.PI / 2} />
      <EmptyDesk p={[-13, 0, 3]} ry={Math.PI / 2} />
      <EmptyDesk p={[13, 0, -3]} ry={-Math.PI / 2} />
      <EmptyDesk p={[13, 0, 3]} ry={-Math.PI / 2} />
      {/* Printer, lampalar, o'simliklar */}
      <StandingLamp p={[-9, 0, 6]} />
      <StandingLamp p={[9, 0, -6]} />
      <Plant p={[-16, 0, 6]} scale={1.1} />
      <Plant p={[16, 0, 6]} scale={1.1} />
      <Plant p={[-16, 0, -6]} scale={1.1} />
      <Plant p={[16, 0, -6]} scale={1.1} />
      <Plant p={[-3, 0, 6.5]} scale={0.9} />
      <Plant p={[3, 0, 6.5]} scale={0.9} />

      {/* Devor rasmlari */}
      <Painting p={[-22.85, 1.7, 0]} ry={Math.PI / 2} c="#c85a3c" />
      <Painting p={[22.85, 1.7, 0]} ry={-Math.PI / 2} c="#3a7bc8" />
    </group>
  );
}
