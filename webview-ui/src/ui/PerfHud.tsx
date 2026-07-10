import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { useRef } from "react";
import type * as THREE from "three";
import { useOffice } from "../store";

// ── Perf o'lchagich (faqat `?perf` bilan) ───────────────────
// Optimallashtirishni raqamsiz qilib bo'lmaydi. Bu probe har ~500ms'da
// FPS / draw-call / uchburchak / mesh / material sonini o'lchaydi va
// `window.__perf`ga yozadi (puppeteer avtomatik o'qiy oladi).
// `?perf` bo'lmasa umuman mount qilinmaydi → production'da nol xarajat.

export const PERF_ENABLED =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("perf");

export interface PerfStats {
  fps: number;
  calls: number;
  tris: number;
  meshes: number;
  materials: number;
  geometries: number;
  programs: number;
}

const stats: PerfStats = { fps: 0, calls: 0, tris: 0, meshes: 0, materials: 0, geometries: 0, programs: 0 };

/** Canvas ICHIDA turadi — renderer ma'lumotini o'qiydi. */
export function PerfProbe() {
  const { gl, scene } = useThree();
  const frames = useRef(0);
  const last = useRef(performance.now());

  useFrame(() => {
    frames.current++;
    const now = performance.now();
    if (now - last.current < 500) return;

    stats.fps = Math.round((frames.current * 1000) / (now - last.current));
    frames.current = 0;
    last.current = now;

    // gl.info har render boshida nollanadi → bu o'tgan freym qiymatlari.
    stats.calls = gl.info.render.calls;
    stats.tris = gl.info.render.triangles;
    stats.geometries = gl.info.memory.geometries;
    stats.programs = gl.info.programs?.length ?? 0;

    let meshes = 0;
    const mats = new Set<THREE.Material>();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes++;
      if (Array.isArray(m.material)) m.material.forEach((x) => mats.add(x));
      else if (m.material) mats.add(m.material);
    });
    stats.meshes = meshes;
    stats.materials = mats.size;

    (window as unknown as { __perf?: PerfStats }).__perf = { ...stats };
  });

  return null;
}

const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14 };

/** DOM overlay — Canvas TASHQARISIDA. */
export function PerfOverlay() {
  const [s, setS] = useState<PerfStats>({ ...stats });
  const agents = useOffice((o) => o.order.length);
  useEffect(() => {
    const t = setInterval(() => setS({ ...stats }), 500);
    return () => clearInterval(t);
  }, []);

  const fpsColor = s.fps >= 55 ? "#30d158" : s.fps >= 30 ? "#ffd60a" : "#ff453a";
  return (
    <div
      style={{
        position: "absolute", top: 52, left: 14, pointerEvents: "none", zIndex: 50,
        padding: "8px 11px", borderRadius: 9, minWidth: 168,
        background: "rgba(10,13,18,0.9)", border: "1px solid rgba(255,255,255,0.14)",
        color: "#dfe6ee", fontFamily: "ui-monospace, monospace", fontSize: 11, lineHeight: 1.7,
      }}
    >
      <div style={{ ...row, fontWeight: 700, color: fpsColor }}><span>FPS</span><span>{s.fps}</span></div>
      <div style={row}><span>draw calls</span><span>{s.calls}</span></div>
      <div style={row}><span>uchburchak</span><span>{s.tris.toLocaleString()}</span></div>
      <div style={row}><span>mesh</span><span>{s.meshes}</span></div>
      <div style={row}><span>material</span><span>{s.materials}</span></div>
      <div style={row}><span>geometriya</span><span>{s.geometries}</span></div>
      <div style={row}><span>shader</span><span>{s.programs}</span></div>
      <div style={{ ...row, marginTop: 3, opacity: 0.6 }}><span>agent</span><span>{agents}</span></div>
    </div>
  );
}
