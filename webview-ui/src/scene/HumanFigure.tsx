import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useSettings } from "../settings";
import type { AgentStatus } from "../store";
import { BONE_INDEX, type BoneName, buildBones, humanGeometry } from "./humanRig";
import type { CharSkin } from "./roles";
import { STATUS_COLOR } from "./roles";
import { basicMat } from "./resources";
import { visibleObject } from "./visibility";

// ── Agent personaji: protsedural yarim-realistik odam (S8-7) ──
// Avvalgi voxel personaj bilan bir xil props va animatsiya mantig'i; farqi — tana bitta
// SkinnedMesh (1 draw call), guruhlar o'rniga suyaklar aylantiriladi.

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
const RING_GEO = new THREE.RingGeometry(0.06, 0.1, 18);

interface Props {
  skin: CharSkin;
  status: AgentStatus;
  pose?: "sit" | "stand";
  moving?: boolean;
  detail?: "high" | "low";
  getState?: () => { sit: boolean; moving: boolean; speed?: number };
  energy?: number;
  /** Bo'sh (idle) o'tirgandagi poza: 0 — qo'llar tizzada (standart), 1 — suyanib,
   *  qo'llar tayanchda, 2 — qo'lidagi telefonga qaraydi, 3 — oyoq ustiga oyoq. */
  idleStyle?: number;
}

function damp(c: number, t: number, l: number, dt: number): number {
  return THREE.MathUtils.lerp(c, t, 1 - Math.exp(-l * dt));
}

export default function HumanFigure({ skin: s, status, pose = "sit", moving = false, detail = "high", getState, energy = 1, idleStyle = 0 }: Props) {
  const en = Math.max(0.5, Math.min(1.6, energy));
  const rootRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  // Har nusxaga o'z skeleti; geometriya bir xil ko'rinishdagilar orasida umumiy.
  // Kalit — qiymatlardan (skin obyekti har renderda yangidan yaratilishi mumkin:
  // characterFor(); obyekt bo'yicha memo har renderda skeletni qayta qurardi).
  const skinKey = [s.skin, s.hair, s.hairStyle, s.top, s.bottom, s.shoes, s.accessory ?? ""].join("|");
  const { mesh, bone } = useMemo(() => {
    const geo = humanGeometry(s, detail);
    const bones = buildBones();
    const m = new THREE.SkinnedMesh(geo, MAT);
    m.add(bones[0]);
    m.bind(new THREE.Skeleton(bones));
    m.frustumCulled = false; // pozaga qarab cho'ziladi; agentlar soni kichik
    m.castShadow = false; // agentlar soya tashlamaydi (kontakt-soya bor)
    const by = (n: BoneName) => bones[BONE_INDEX[n]];
    return { mesh: m, bone: by };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skinKey, detail]);
  useEffect(() => () => mesh.skeleton.dispose(), [mesh]);

  const walkPhase = useRef(0);
  const walkBlend = useRef(0);
  const t = useRef(Math.random() * 10);
  const stretchLeft = useRef(0);
  const stretchCd = useRef(6 + Math.random() * 10);
  const blinkLeft = useRef(0);
  const blinkCd = useRef(2 + Math.random() * 4);
  const glanceCd = useRef(3 + Math.random() * 5);
  const headYaw = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    if (rootRef.current && !visibleObject(rootRef.current)) return;
    const rm = useSettings.getState().reducedMotion;
    t.current += rm ? 0 : dt;
    const tt = t.current;
    const st = getState ? getState() : { sit: pose === "sit", moving };
    const sit = st.sit;
    const working = sit && (status === "working" || status === "collab");
    const thinking = sit && status === "thinking";
    const walk = !sit && st.moving;
    const idleSit = sit && status === "idle" ? idleStyle : 0;

    const standingIdle = !sit && !st.moving && status === "idle" && !rm;
    if (standingIdle) {
      if (stretchLeft.current <= 0) {
        stretchCd.current -= dt;
        if (stretchCd.current <= 0) { stretchLeft.current = 1.7; stretchCd.current = 10 + Math.random() * 14; }
      } else stretchLeft.current -= dt;
    } else stretchLeft.current = 0;
    const stretching = stretchLeft.current > 0;

    const spd = st.speed ?? 0;
    walkPhase.current += (spd / 0.34) * Math.PI * dt;
    walkBlend.current = damp(walkBlend.current, walk ? 1 : 0, 9, dt);
    const wp = walkPhase.current, wb = walkBlend.current;
    const gait = Math.sin(wp);
    const gaitC = Math.cos(wp);

    const pelvis = bone("pelvis");
    pelvis.position.y = damp(pelvis.position.y, sit ? 0.55 : 0.92 + Math.abs(gaitC) * 0.03 * wb, 12, dt);
    if (ringRef.current) ringRef.current.position.y = damp(ringRef.current.position.y, sit ? 1.42 : 1.85, 12, dt);

    const swing = gait * 0.6 * wb;
    const kneeSwingL = Math.max(0, gait) * 0.55 * wb;
    const kneeSwingR = Math.max(0, -gait) * 0.55 * wb;
    // Ishora: rotation.x musbat → oyoq oldinga (−z).
    const hipL = bone("hipL"), hipR = bone("hipR"), kneeL = bone("kneeL"), kneeR = bone("kneeR");
    // Oyoq ustiga oyoq (idleSit 3): o'ng son ko'tarilib, chap tizza ustidan o'tadi.
    const cross = idleSit === 3;
    hipL.rotation.x = damp(hipL.rotation.x, sit ? 1.5 : swing, 12, dt);
    hipR.rotation.x = damp(hipR.rotation.x, sit ? (cross ? 1.95 : 1.5) : -swing, 12, dt);
    hipR.rotation.z = damp(hipR.rotation.z, cross ? -0.32 : 0, 10, dt);
    kneeL.rotation.x = damp(kneeL.rotation.x, sit ? -1.5 : kneeSwingL + 0.02, 12, dt);
    kneeR.rotation.x = damp(kneeR.rotation.x, sit ? (cross ? -1.55 : -1.5) : kneeSwingR + 0.02, 12, dt);
    bone("ankleL").rotation.x = damp(bone("ankleL").rotation.x, sit ? 0.5 : -kneeSwingL * 0.7, 10, dt);
    bone("ankleR").rotation.x = damp(bone("ankleR").rotation.x, sit ? (cross ? 0.2 : 0.5) : -kneeSwingR * 0.7, 10, dt);

    let lean = 0.03;
    if (stretching) lean = -0.22;
    else if (working) lean = 0.2 + Math.sin(tt * 9) * 0.012;
    else if (thinking) lean = -0.04;
    else if (walk) lean = 0.11;
    else if (idleSit === 1) lean = -0.14;
    else if (idleSit === 2) lean = 0.1;
    else if (idleSit === 3) lean = -0.06;
    const breathe = 1 + Math.sin(tt * (walk ? 5 : working ? 3.5 : 1.9)) * (walk ? 0.01 : 0.016) * (1 + 0.3 * Math.sin(tt * 0.29));
    const spine = bone("spine");
    // lean/nod: musbat = OLDINGA (−z). rotation.x musbat esa yuqori uchini +z ga
    // (orqaga) og'diradi — shuning uchun ishora teskari (avvalgi voxel personajda
    // ham shunday xato bo'lgan: "yozyapti" orqaga suyanar, "pastga qarash" tepaga edi).
    spine.rotation.x = damp(spine.rotation.x, -lean, 7, dt);
    spine.scale.y = damp(spine.scale.y, breathe, 6, dt);
    spine.rotation.y = damp(spine.rotation.y, -gait * 0.18 * wb, 8, dt);

    let nod = 0, tilt = 0;
    if (stretching) nod = -0.3;
    else if (thinking) { tilt = 0.2; nod = -0.06; }
    else if (working) nod = 0.2 + Math.sin(tt * 4.5) * 0.03;
    else if (status === "review") nod = 0.14;
    else if (idleSit === 2) nod = 0.42; // telefonga qaraydi
    if (!working && idleSit !== 2 && !rm) {
      glanceCd.current -= dt;
      if (glanceCd.current <= 0) {
        headYaw.current = (Math.random() - 0.5) * 0.7 * (0.7 + 0.3 * en);
        glanceCd.current = (2.5 + Math.random() * 4) / en;
      }
    } else headYaw.current = 0;
    const head = bone("head");
    head.rotation.x = damp(head.rotation.x, -(nod + Math.sin(tt * 1.6) * 0.02 + Math.sin(tt * 0.37) * 0.015), 7, dt);
    head.rotation.z = damp(head.rotation.z, tilt, 6, dt);
    head.rotation.y = damp(head.rotation.y, headYaw.current + Math.sin(tt * 0.5) * 0.03, 5, dt);

    if (rm) blinkLeft.current = 0;
    else if (blinkLeft.current <= 0) {
      blinkCd.current -= dt;
      if (blinkCd.current <= 0) { blinkLeft.current = 0.12; blinkCd.current = 2 + Math.random() * 5; }
    } else blinkLeft.current -= dt;
    const bl = blinkLeft.current;
    bone("eyes").scale.y = bl > 0 ? Math.max(0.08, 1 - Math.sin((1 - bl / 0.12) * Math.PI) * 0.95) : 1;

    const armSwing = gait * 0.5 * wb;
    let shTL: number, shTR: number, elTL: number, elTR: number;
    // Yelkaning yon (z) va ichkariga (y) burilishi: z musbat — qo'l +x tomonga.
    // 0 — oddiy pozalar (yozish, yurish...).
    let shZL = 0, shZR = 0, shYL = 0, shYR = 0;
    if (stretching) { shTL = -2.6; shTR = -2.7; elTL = 0.15; elTR = 0.15; }
    else if (sit && thinking) {
      // O'ng kaft iyakda (burchaklar suyaklar ustida sonli qidiruv bilan topilgan),
      // chap qo'l ko'krak oldidan o'tib, o'ng tirsakni tutib turadi.
      shTR = 1.8 + Math.sin(tt * 1.4) * 0.03; shYR = 0.35; shZR = -0.7; elTR = 1.95;
      shTL = 1.15; shYL = -0.9; shZL = 0.7; elTL = 1.6;
    }
    else if (sit) {
      const tapL = working ? Math.max(0, Math.sin(tt * 11)) * 0.25 : 0;
      const tapR = working ? Math.max(0, Math.sin(tt * 11 + 1.6)) * 0.25 : 0;
      shTL = working ? 0.95 + tapL : 0.5; shTR = working ? 0.95 + tapR : 0.5;
      elTL = working ? 0.7 + tapL : 0.22; elTR = working ? 0.7 + tapR : 0.22;
    } else { shTL = -armSwing; shTR = armSwing; elTL = 0.2 + Math.abs(armSwing) * 0.4; elTR = elTL; }
    if (idleSit === 1) { shTL = shTR = 0.25; elTL = elTR = 1.3; shZL = -0.14; shZR = 0.14; } // tayanchlarda
    else if (idleSit === 2) { shTL = shTR = 0.6; elTL = elTR = 1.55; shZL = 0.22; shZR = -0.22; } // telefon
    else if (idleSit === 3) { shTL = 0.55; shTR = 0.5; elTL = 0.5; elTR = 0.6; shZL = 0.18; shZR = -0.05; } // tizzada
    bone("shoulderL").rotation.z = damp(bone("shoulderL").rotation.z, shZL, 10, dt);
    bone("shoulderR").rotation.z = damp(bone("shoulderR").rotation.z, shZR, 10, dt);
    bone("shoulderL").rotation.y = damp(bone("shoulderL").rotation.y, shYL, 10, dt);
    bone("shoulderR").rotation.y = damp(bone("shoulderR").rotation.y, shYR, 10, dt);
    bone("shoulderL").rotation.x = damp(bone("shoulderL").rotation.x, shTL, 10, dt);
    bone("shoulderR").rotation.x = damp(bone("shoulderR").rotation.x, shTR, 10, dt);
    bone("elbowL").rotation.x = damp(bone("elbowL").rotation.x, elTL, 10, dt);
    bone("elbowR").rotation.x = damp(bone("elbowR").rotation.x, elTR, 10, dt);

    if (rootRef.current) {
      const sway = status === "blocked" ? Math.sin(tt * 20) * 0.02 : walk ? gaitC * 0.028 * wb : Math.sin(tt * 0.7) * 0.01;
      rootRef.current.rotation.z = damp(rootRef.current.rotation.z, sway, walk ? 9 : 5, dt);
    }
  });

  return (
    <group ref={rootRef}>
      <primitive object={mesh} />
      <mesh ref={ringRef} position={[0, 1.85, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={RING_GEO} material={basicMat(STATUS_COLOR[status], { transparent: true, opacity: 0.9, side: THREE.DoubleSide })} />
    </group>
  );
}
