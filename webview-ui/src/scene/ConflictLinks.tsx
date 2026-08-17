import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { fileConflicts } from "../insights";
import { useOffice } from "../store";
import { UNIT_BOX } from "./resources";
import { seatFor } from "./roles";

// ── Fayl to'qnashuvini ofisда KO'RSATISH ─────────────────────
// Insights matnда aytadi ("2 agent «store.ts»ni tahrirlamoqda"); bu esa 3D'da
// ko'rsatadi: to'qnashuvdagi agentlar ostида amber halqa, ularni bog'lovchi
// chiziq va o'rtaда fayl nomi. Ma'lumot O'LCHANGAN (insights.fileConflicts),
// hech narsa to'qib chiqarilmaydi. Faqat izometrik ko'rinishda (poldan o'qiladi).

const CONFLICT = "#ff9f0a";
const RING_G = new THREE.RingGeometry(0.5, 0.64, 30);
const RING_M = new THREE.MeshBasicMaterial({ color: CONFLICT, transparent: true, opacity: 0.5, side: THREE.DoubleSide, toneMapped: false });
const LINK_M = new THREE.MeshBasicMaterial({ color: CONFLICT, transparent: true, opacity: 0.6, toneMapped: false });

export default function ConflictLinks() {
  const agents = useOffice((s) => s.agents);
  const order = useOffice((s) => s.order);
  const conflicts = useMemo(
    () => fileConflicts(order.map((id) => agents[id]).filter(Boolean)),
    [agents, order],
  );

  // Nozik puls — e'tibor tortadi, lekin bezovta qilmaydi (materiallar ulushli).
  useFrame((state) => {
    const p = 0.35 + (Math.sin(state.clock.elapsedTime * 3) + 1) * 0.17;
    RING_M.opacity = p;
    LINK_M.opacity = p + 0.1;
  });

  if (conflicts.length === 0) return null;
  return (
    <group>
      {conflicts.map((c) => {
        const pts = c.ids.map((id) => agents[id]).filter(Boolean).map((a) => seatFor(a!.seatIndex));
        if (pts.length < 2) return null;
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
        return (
          <group key={c.key}>
            {pts.map((p, i) => (
              <group key={i}>
                {/* Agent ostidagi halqa */}
                <mesh geometry={RING_G} material={RING_M} position={[p.x, 0.06, p.z]} rotation={[-Math.PI / 2, 0, 0]} />
                {/* Markazga bog'lovchi chiziq (juftlik → orasidagi chiziq) */}
                {(() => {
                  const dx = p.x - cx, dz = p.z - cz;
                  const len = Math.hypot(dx, dz);
                  if (len < 0.02) return null;
                  return <mesh geometry={UNIT_BOX} material={LINK_M} position={[(p.x + cx) / 2, 0.08, (p.z + cz) / 2]} rotation={[0, Math.atan2(dx, dz), 0]} scale={[0.045, 0.02, len]} />;
                })()}
              </group>
            ))}
            {/* Fayl nomi — o'rtaда, tepaда */}
            <Html position={[cx, 1.95, cz]} center style={{ pointerEvents: "none" }}>
              <div style={{ padding: "3px 9px", borderRadius: 10, background: "rgba(255,159,10,0.95)", color: "#241800", fontFamily: "system-ui", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.45)" }}>⚠️ {c.file}</div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
