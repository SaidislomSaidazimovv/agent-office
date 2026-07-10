import { memo } from "react";
import * as THREE from "three";
import type { AgentView } from "../store";
import { useOffice } from "../store";
import { useDaylight } from "./daylight";
import { basicMat, cyl, stdMat, UNIT_BOX } from "./resources";
import { seatFor, STATUS_COLOR } from "./roles";

// ── Agent ish joyi — MEBEL (personaj AgentAvatar'da, alohida) ──

const DESK_TOP = 0.72;
type V3 = [number, number, number];
function B({ p, s, m, cast = true }: { p?: V3; s: V3; m: THREE.Material; cast?: boolean }) {
  return <mesh position={p} scale={s} geometry={UNIT_BOX} material={m} castShadow={cast} />;
}
// Statik (holatga bog'liq bo'lmagan) materiallar — bir marta keshlanadi.
const DESK_TOP_M = stdMat("#f2efe9", { roughness: 0.4 });
const DESK_EDGE_M = stdMat("#2a2e35", { roughness: 0.4 });
const LEG_M = stdMat("#4a4f57", { roughness: 0.4, metalness: 0.6 });
const MON_M = stdMat("#12151a", { roughness: 0.3 });
const STAND_M = stdMat("#3a3f47");
const KEY_M = stdMat("#e2e2e0", { roughness: 0.6 });
const MUG_M = stdMat("#ffffff", { roughness: 0.4 });
const CHAIR_M = stdMat("#2c313a", { roughness: 0.6 });
const ARM_M = stdMat("#1c2027");
const POST_M = stdMat("#8b929c", { roughness: 0.35, metalness: 0.85 });
const STAR_M = stdMat("#3a3f47", { roughness: 0.4, metalness: 0.6 });
const SCREEN_G = new THREE.PlaneGeometry(0.64, 0.36);
const GLOW_G = new THREE.PlaneGeometry(0.98, 0.66);

function Workstation({ agent }: { agent: AgentView }) {
  const seat = seatFor(agent.seatIndex);
  const select = useOffice((s) => s.select);
  const color = STATUS_COLOR[agent.status];
  // Ekran porlashi kechаsi kuchayadi (qorong'uда monitorlar ko'proq ajralib turadi).
  const lampsOn = useDaylight((s) => s.params.lamps);
  const glowOpacity = lampsOn ? 0.4 : 0.2;

  return (
    <group position={[seat.x, 0, seat.z]} rotation={[0, seat.ry, 0]} onClick={(e) => { e.stopPropagation(); select(agent.id); }}>
      {/* Stol usti — oq + qora aksent qirra */}
      <B p={[0, DESK_TOP, 0]} s={[1.5, 0.06, 0.8]} m={DESK_TOP_M} />
      <B p={[0, DESK_TOP - 0.045, 0]} s={[1.52, 0.03, 0.82]} m={DESK_EDGE_M} cast={false} />
      {/* nozik chrome A-oyoqlar */}
      {[-0.64, 0.64].map((x) => <B key={x} p={[x, DESK_TOP / 2 - 0.03, 0]} s={[0.05, DESK_TOP - 0.06, 0.68]} m={LEG_M} />)}

      {/* Slim monitor — ekran holat rangida */}
      <group position={[0, DESK_TOP + 0.02, -0.22]}>
        <B p={[0, 0.26, 0]} s={[0.7, 0.42, 0.03]} m={MON_M} />
        <mesh position={[0, 0.26, -0.02]} geometry={SCREEN_G} material={basicMat(color, { toneMapped: false })} />
        {/* ekran porlashi — holat rangida yumshoq halo */}
        <mesh position={[0, 0.26, -0.025]} geometry={GLOW_G} material={basicMat(color, { transparent: true, opacity: glowOpacity, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false })} />
        {/* nozik stend */}
        <B p={[0, 0.05, 0]} s={[0.05, 0.16, 0.05]} m={STAND_M} />
        <B p={[0, -0.02, 0]} s={[0.26, 0.02, 0.14]} m={DESK_EDGE_M} cast={false} />
      </group>

      {/* Klaviatura + krujka */}
      <B p={[0, DESK_TOP + 0.04, 0.14]} s={[0.5, 0.02, 0.16]} m={KEY_M} />
      <mesh position={[0.55, DESK_TOP + 0.08, 0.05]} castShadow geometry={cyl(0.05, 0.045, 0.1, 12)} material={MUG_M} />

      {/* Zamonaviy ergonomik kursi (5-yulduzli baza) */}
      <group position={[0, 0, 0.62]}>
        <B p={[0, 0.46, 0]} s={[0.48, 0.07, 0.48]} m={CHAIR_M} />
        <B p={[0, 0.74, 0.22]} s={[0.46, 0.5, 0.06]} m={CHAIR_M} />
        {/* qo'l tayanchlar */}
        {[-0.26, 0.26].map((x) => <B key={x} p={[x, 0.56, 0.05]} s={[0.05, 0.04, 0.3]} m={ARM_M} cast={false} />)}
        <mesh position={[0, 0.22, 0]} geometry={cyl(0.04, 0.05, 0.44, 10)} material={POST_M} />
        {[0, 1, 2, 3, 4].map((i) => { const a = (i / 5) * Math.PI * 2; return <B key={i} p={[Math.cos(a) * 0.22, 0.04, Math.sin(a) * 0.22]} s={[0.22, 0.04, 0.05]} m={STAR_M} />; })}
      </group>
    </group>
  );
}

// memo — o'zgarmagan agentda qayta render bo'lmaydi (perf).
export default memo(Workstation);
