import type { JSX } from "react";
import { Bookshelf, CoffeeTable, EmptyDesk, MeetingTable, Plant, Sofa, StandingLamp } from "./OfficeDecor";

// ── Joylashtiriladigan mebel katalogi (Layout editor) ────────
// Ikki manba: (1) o'rnatilgan mebel; (2) tashqi asset paketlari — JSON
// manifest orqali primitivlardan (box/cylinder/cone/sphere) yasaladi.

export interface FurnitureDef {
  type: string;
  label: string;
  emoji: string;
  /** Poydevor yarim-o'lchamlari (ry=0 da), collision AABB uchun. */
  hx: number;
  hz: number;
  render: () => JSX.Element;
}

// ── Tashqi paket format (JSON) ──
export interface PackPart {
  shape: "box" | "cylinder" | "cone" | "sphere";
  size: number[]; // box:[w,h,d] · cylinder/cone:[radius,height] · sphere:[radius]
  pos: [number, number, number];
  ry?: number;
  color: string;
  emissive?: string;
  opacity?: number;
}
export interface PackItem {
  type: string;
  label: string;
  emoji: string;
  hx: number;
  hz: number;
  parts: PackPart[];
}

// ── Generic renderer — paket mebelini primitivlardan chizadi ──
export function GenericFurniture({ parts }: { parts: PackPart[] }): JSX.Element {
  return (
    <group>
      {parts.map((p, i) => {
        const mat = (
          <meshStandardMaterial
            color={p.color}
            emissive={p.emissive ?? "#000000"}
            emissiveIntensity={p.emissive ? 0.6 : 0}
            transparent={p.opacity != null && p.opacity < 1}
            opacity={p.opacity ?? 1}
            roughness={0.85}
          />
        );
        const pos = p.pos;
        const rot: [number, number, number] = [0, p.ry ?? 0, 0];
        if (p.shape === "box") {
          return <mesh key={i} position={pos} rotation={rot} castShadow receiveShadow><boxGeometry args={[p.size[0], p.size[1], p.size[2]]} />{mat}</mesh>;
        }
        if (p.shape === "cylinder") {
          return <mesh key={i} position={pos} rotation={rot} castShadow><cylinderGeometry args={[p.size[0], p.size[0], p.size[1], 12]} />{mat}</mesh>;
        }
        if (p.shape === "cone") {
          return <mesh key={i} position={pos} rotation={rot} castShadow><coneGeometry args={[p.size[0], p.size[1], 10]} />{mat}</mesh>;
        }
        return <mesh key={i} position={pos} rotation={rot} castShadow><sphereGeometry args={[p.size[0], 12, 10]} />{mat}</mesh>;
      })}
    </group>
  );
}

// ── O'rnatilgan mebel ──
export const BUILTIN: FurnitureDef[] = [
  { type: "plant", label: "O'simlik", emoji: "🪴", hx: 0.3, hz: 0.3, render: () => <Plant p={[0, 0, 0]} scale={1.1} /> },
  { type: "desk", label: "Ish stoli", emoji: "🖥️", hx: 0.72, hz: 0.42, render: () => <EmptyDesk p={[0, 0, 0]} /> },
  { type: "sofa", label: "Divan", emoji: "🛋️", hx: 1.12, hz: 0.48, render: () => <Sofa p={[0, 0, 0]} /> },
  { type: "coffee", label: "Jurnal stoli", emoji: "☕", hx: 0.56, hz: 0.32, render: () => <CoffeeTable p={[0, 0, 0]} /> },
  { type: "meeting", label: "Majlis stoli", emoji: "🪑", hx: 1.1, hz: 1.1, render: () => <MeetingTable p={[0, 0, 0]} r={0.9} /> },
  { type: "shelf", label: "Kitob javoni", emoji: "📚", hx: 0.62, hz: 0.2, render: () => <Bookshelf p={[0, 0, 0]} /> },
  { type: "lamp", label: "Chiroq", emoji: "💡", hx: 0.24, hz: 0.24, render: () => <StandingLamp p={[0, 0, 0]} /> },
];
export const CATALOG = BUILTIN; // moslashuvchanlik uchun eski nom

// ── Paket registri (dinamik) ──
const packRegistry: Record<string, FurnitureDef> = {};

/** Paket item'larini FurnitureDef'ga aylantirib ro'yxatga oladi. */
export function registerPacks(items: PackItem[]): void {
  for (const it of items) {
    packRegistry[it.type] = {
      type: it.type,
      label: it.label,
      emoji: it.emoji,
      hx: it.hx,
      hz: it.hz,
      render: () => <GenericFurniture parts={it.parts} />,
    };
  }
}

const BY_TYPE: Record<string, FurnitureDef> = Object.fromEntries(BUILTIN.map((d) => [d.type, d]));

export function furnitureDef(type: string): FurnitureDef | undefined {
  return BY_TYPE[type] ?? packRegistry[type];
}

/** Joylashtirilgan mebelning aylangan AABB yarim-o'lchamlari (collision uchun). */
export function footprint(type: string, ry: number): { hx: number; hz: number } {
  const d = furnitureDef(type);
  if (!d) return { hx: 0.3, hz: 0.3 };
  const c = Math.abs(Math.cos(ry));
  const s = Math.abs(Math.sin(ry));
  return { hx: d.hx * c + d.hz * s + 0.05, hz: d.hx * s + d.hz * c + 0.05 };
}

/** JSON paketni tekshirib PackItem[] qaytaradi (yaroqsiz bo'lsa null). */
export function parsePack(text: string): PackItem[] | null {
  try {
    const o = JSON.parse(text);
    const raw = Array.isArray(o?.items) ? o.items : Array.isArray(o) ? o : null;
    if (!raw) return null;
    const out: PackItem[] = [];
    for (const it of raw) {
      if (!it || typeof it.type !== "string" || !Array.isArray(it.parts)) continue;
      const parts: PackPart[] = it.parts
        .filter((p: PackPart) => p && ["box", "cylinder", "cone", "sphere"].includes(p.shape) && Array.isArray(p.size) && Array.isArray(p.pos) && typeof p.color === "string")
        .map((p: PackPart) => ({ shape: p.shape, size: p.size.map(Number), pos: [Number(p.pos[0]) || 0, Number(p.pos[1]) || 0, Number(p.pos[2]) || 0], ry: Number(p.ry) || 0, color: p.color, emissive: typeof p.emissive === "string" ? p.emissive : undefined, opacity: typeof p.opacity === "number" ? p.opacity : undefined }));
      if (!parts.length) continue;
      out.push({
        type: it.type,
        label: typeof it.label === "string" ? it.label : it.type,
        emoji: typeof it.emoji === "string" ? it.emoji : "📦",
        hx: Number(it.hx) || 0.4,
        hz: Number(it.hz) || 0.4,
        parts,
      });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}
