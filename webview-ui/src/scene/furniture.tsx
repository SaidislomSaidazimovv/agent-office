import type { JSX } from "react";
import { Bookshelf, CoffeeTable, EmptyDesk, MeetingTable, Plant, Sofa, StandingLamp } from "./OfficeDecor";

// ── Joylashtiriladigan mebel katalogi (Layout editor) ────────
// Har tur: yorliq + emoji + poydevor yarim-o'lchamlari (collision uchun) +
// render. Render origin'da (0,0,0), ry=0 chizadi — joylashtirish/aylantirish
// tashqi group orqali qo'llanadi.

export interface FurnitureDef {
  type: string;
  label: string;
  emoji: string;
  /** Poydevor yarim-o'lchamlari (ry=0 da), collision AABB uchun. */
  hx: number;
  hz: number;
  render: () => JSX.Element;
}

export const CATALOG: FurnitureDef[] = [
  { type: "plant", label: "O'simlik", emoji: "🪴", hx: 0.3, hz: 0.3, render: () => <Plant p={[0, 0, 0]} scale={1.1} /> },
  { type: "desk", label: "Ish stoli", emoji: "🖥️", hx: 0.72, hz: 0.42, render: () => <EmptyDesk p={[0, 0, 0]} /> },
  { type: "sofa", label: "Divan", emoji: "🛋️", hx: 1.12, hz: 0.48, render: () => <Sofa p={[0, 0, 0]} /> },
  { type: "coffee", label: "Jurnal stoli", emoji: "☕", hx: 0.56, hz: 0.32, render: () => <CoffeeTable p={[0, 0, 0]} /> },
  { type: "meeting", label: "Majlis stoli", emoji: "🪑", hx: 1.1, hz: 1.1, render: () => <MeetingTable p={[0, 0, 0]} r={0.9} /> },
  { type: "shelf", label: "Kitob javoni", emoji: "📚", hx: 0.62, hz: 0.2, render: () => <Bookshelf p={[0, 0, 0]} /> },
  { type: "lamp", label: "Chiroq", emoji: "💡", hx: 0.24, hz: 0.24, render: () => <StandingLamp p={[0, 0, 0]} /> },
];

const BY_TYPE: Record<string, FurnitureDef> = Object.fromEntries(CATALOG.map((d) => [d.type, d]));

export function furnitureDef(type: string): FurnitureDef | undefined {
  return BY_TYPE[type];
}

/** Joylashtirilgan mebelning aylangan AABB yarim-o'lchamlari (collision uchun). */
export function footprint(type: string, ry: number): { hx: number; hz: number } {
  const d = BY_TYPE[type];
  if (!d) return { hx: 0.3, hz: 0.3 };
  const c = Math.abs(Math.cos(ry));
  const s = Math.abs(Math.sin(ry));
  return { hx: d.hx * c + d.hz * s + 0.05, hz: d.hx * s + d.hz * c + 0.05 };
}
