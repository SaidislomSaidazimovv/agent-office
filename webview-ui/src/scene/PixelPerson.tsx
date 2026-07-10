import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { AgentStatus } from "../store";
import type { Accessory as AccessoryType, CharSkin, HairStyle } from "./roles";
import { STATUS_COLOR } from "./roles";
import { basicMat, sphere, stdMat, UNIT_BOX } from "./resources";

// Ulashilgan birlik-kub qutisi: har voxel bo'lagi bitta geometriya + keshlangan
// material (20 agentda minglab dublikat o'rniga o'nlab noyob obyekt).
type V3 = [number, number, number];
function VB({ p, s, m, cast = true }: { p?: V3; s: V3; m: THREE.Material; cast?: boolean }) {
  return <mesh position={p} scale={s} geometry={UNIT_BOX} material={m} castShadow={cast} />;
}
const EYE_WHITE = stdMat("#f4f0ea", { roughness: 0.5 });
const EYE_PUPIL = stdMat("#1a1a22");
const RING_GEO = new THREE.RingGeometry(0.06, 0.1, 18);

// ── Voxel chibi personaj: o'tirish / turish / yurish ─────────
// pose="sit" — stolda o'tirib yozadi (working/thinking...).
// pose="stand" + moving — tik turib yuradi (bo'sh turganda sayr).

interface Props {
  skin: CharSkin;
  status: AgentStatus;
  pose?: "sit" | "stand";
  moving?: boolean;
  /** Har freym o'qiladi (re-render'siz poza/harakatni yangilash uchun). */
  getState?: () => { sit: boolean; moving: boolean };
}

function damp(c: number, t: number, l: number, dt: number): number {
  return THREE.MathUtils.lerp(c, t, 1 - Math.exp(-l * dt));
}

// Bosh aksessuari — per-agent xilma-xillik (bosh markazida, old = -z).
function Accessory({ type }: { type: AccessoryType }) {
  if (type === "glasses") {
    const gm = stdMat("#15181d", { roughness: 0.4, metalness: 0.3 });
    return (
      <group position={[0, 0.025, -0.152]}>
        {[-0.07, 0.07].map((x) => <mesh key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]} material={gm}><torusGeometry args={[0.043, 0.008, 6, 14]} /></mesh>)}
        <VB s={[0.055, 0.008, 0.008]} m={gm} cast={false} />
        {[-0.11, 0.11].map((x) => <VB key={x} p={[x, 0, 0.09]} s={[0.008, 0.008, 0.18]} m={gm} cast={false} />)}
      </group>
    );
  }
  if (type === "headphones") {
    const hm = stdMat("#23262b", { roughness: 0.5 });
    return (
      <group>
        <mesh position={[0, 0.02, 0]} material={hm}><torusGeometry args={[0.175, 0.022, 8, 16, Math.PI]} /></mesh>
        {[-0.162, 0.162].map((x) => <VB key={x} p={[x, 0.0, 0]} s={[0.05, 0.13, 0.13]} m={hm} />)}
      </group>
    );
  }
  if (type === "cap") {
    const cm = stdMat("#2f6bd6", { roughness: 0.8 });
    return (
      <group position={[0, 0.155, 0]}>
        <VB s={[0.335, 0.11, 0.335]} m={cm} />
        <VB p={[0, -0.045, -0.22]} s={[0.3, 0.03, 0.16]} m={cm} />
      </group>
    );
  }
  return null;
}

function Hair({ style, color }: { style: HairStyle; color: string }) {
  const hm = stdMat(color, { roughness: 0.9 });
  const hm2 = stdMat(color, { roughness: 0.95 }); // sferik soch (afro/curly)
  const cap = <VB p={[0, 0.16, 0]} s={[0.33, 0.09, 0.33]} m={hm} />;
  switch (style) {
    case "short":
      return (<group>{cap}<VB p={[0, 0.02, 0.13]} s={[0.33, 0.3, 0.09]} m={hm} /></group>);
    case "long":
      return (
        <group>{cap}
          {[-0.185, 0.185].map((x) => <VB key={x} p={[x, -0.14, 0]} s={[0.06, 0.4, 0.32]} m={hm} />)}
          <VB p={[0, -0.11, 0.15]} s={[0.34, 0.5, 0.08]} m={hm} />
        </group>
      );
    case "afro":
      return (<mesh position={[0, 0.14, 0.01]} castShadow geometry={sphere(0.25, 12, 10)} material={hm2} />);
    case "curly":
      return (
        <group>
          <mesh position={[0, 0.15, 0.01]} castShadow geometry={sphere(0.215, 12, 10)} material={hm2} />
          {[-0.16, 0.16].map((x) => <mesh key={x} position={[x, -0.02, 0]} castShadow geometry={sphere(0.1, 8, 8)} material={hm2} />)}
        </group>
      );
    case "spiky":
      return (
        <group>{cap}
          {[-0.1, 0, 0.1].map((x) => [-0.08, 0.08].map((z) => <mesh key={`${x}_${z}`} position={[x, 0.23, z]} rotation={[0.15 * z, 0, 0.2 * x]} castShadow material={hm}><coneGeometry args={[0.05, 0.13, 4]} /></mesh>))}
        </group>
      );
    default:
      return (
        <group>{cap}
          <VB p={[0, -0.02, 0.14]} s={[0.34, 0.36, 0.09]} m={hm} />
          {[-0.185, 0.185].map((x) => <VB key={x} p={[x, 0, 0.02]} s={[0.06, 0.24, 0.3]} m={hm} />)}
        </group>
      );
  }
}

export default function PixelPerson({ skin: s, status, pose = "sit", moving = false, getState }: Props) {
  const rootRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null); // tos+yuqori (balandligi poza bilan)
  const upperRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const hipL = useRef<THREE.Group>(null);
  const hipR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null);
  const kneeR = useRef<THREE.Group>(null);
  const shoL = useRef<THREE.Group>(null);
  const shoR = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const t = useRef(Math.random() * 10);
  const stretchLeft = useRef(0); // cho'zilish davomi (s)
  const stretchCd = useRef(6 + Math.random() * 10); // keyingi cho'zilishgacha

  const cloth = (c: string) => stdMat(c, { roughness: 0.85 });
  const skin = stdMat(s.skin, { roughness: 0.6 });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    t.current += dt;
    const tt = t.current;
    const st = getState ? getState() : { sit: pose === "sit", moving };
    const sit = st.sit;
    const working = sit && (status === "working" || status === "collab");
    const thinking = sit && status === "thinking";
    const walk = !sit && st.moving;

    // Vaqti-vaqti bilan cho'zilish — faqat HAQIQIY bo'sh (idle) turganда
    // (ishlayotgan yordamchi subagentlar cho'zilmasin).
    const standingIdle = !sit && !st.moving && status === "idle";
    if (standingIdle) {
      if (stretchLeft.current <= 0) {
        stretchCd.current -= dt;
        if (stretchCd.current <= 0) { stretchLeft.current = 1.7; stretchCd.current = 10 + Math.random() * 14; }
      } else {
        stretchLeft.current -= dt;
      }
    } else {
      stretchLeft.current = 0;
    }
    const stretching = stretchLeft.current > 0;

    // Tos balandligi
    const pelvisY = sit ? 0.55 : 0.92 + (walk ? Math.abs(Math.sin(tt * 8)) * 0.03 : 0);
    if (bodyRef.current) bodyRef.current.position.y = damp(bodyRef.current.position.y, pelvisY, 12, dt);
    // Status halqasi — o'tirganda bosh pastga tushadi, halqa ham unga ergashadi.
    if (ringRef.current) ringRef.current.position.y = damp(ringRef.current.position.y, sit ? 1.42 : 1.75, 12, dt);

    // Oyoqlar (o'tirganda son OLDINGA −z, boldir pastga; yurganda tebranish)
    const swing = walk ? Math.sin(tt * 8) * 0.6 : 0;
    if (hipL.current) hipL.current.rotation.x = damp(hipL.current.rotation.x, sit ? 1.5 : swing, 12, dt);
    if (hipR.current) hipR.current.rotation.x = damp(hipR.current.rotation.x, sit ? 1.5 : -swing, 12, dt);
    if (kneeL.current) kneeL.current.rotation.x = damp(kneeL.current.rotation.x, sit ? -1.5 : walk ? Math.max(0, Math.sin(tt * 8)) * 0.5 : 0.02, 12, dt);
    if (kneeR.current) kneeR.current.rotation.x = damp(kneeR.current.rotation.x, sit ? -1.5 : walk ? Math.max(0, -Math.sin(tt * 8)) * 0.5 : 0.02, 12, dt);

    // Yuqori tana engashishi + NAFAS OLISH (ko'krak ko'tarilib-tushadi)
    let lean = 0.03;
    if (stretching) lean = -0.22; // orqaga cho'zilish
    else if (working) lean = 0.2 + Math.sin(tt * 9) * 0.012;
    else if (thinking) lean = -0.04;
    else if (walk) lean = 0.11; // yurganda oldinga engashadi
    const breathe = 1 + Math.sin(tt * (walk ? 5 : working ? 3.5 : 1.9)) * (walk ? 0.014 : 0.024);
    if (upperRef.current) {
      upperRef.current.rotation.x = damp(upperRef.current.rotation.x, lean, 7, dt);
      upperRef.current.scale.y = damp(upperRef.current.scale.y, breathe, 6, dt);
    }

    // Bosh
    let nod = 0, tilt = 0;
    if (stretching) nod = -0.3; // yuqoriga qaraydi
    else if (thinking) { tilt = 0.2; nod = -0.06; }
    else if (working) nod = 0.2 + Math.sin(tt * 4.5) * 0.03;
    else if (status === "review") nod = 0.14;
    if (headRef.current) {
      headRef.current.rotation.x = damp(headRef.current.rotation.x, nod + Math.sin(tt * 1.6) * 0.02, 7, dt);
      headRef.current.rotation.z = damp(headRef.current.rotation.z, tilt, 6, dt);
    }

    // Yelka/qo'l — o'tirganda OLDINGA (yozish), o'ylashda qo'l iyakka,
    // cho'zilishda ikki qo'l tepaga, yurganda tebranish.
    const armSwing = walk ? Math.sin(tt * 8) * 0.5 : 0;
    let shTL: number, shTR: number;
    if (stretching) {
      shTL = -2.6; shTR = -2.7; // qo'llar bosh uzra
    } else if (sit && thinking) {
      shTL = 0.5; shTR = 2.0 + Math.sin(tt * 1.4) * 0.05; // o'ng qo'l iyakka
    } else if (sit) {
      shTL = working ? 0.95 + Math.max(0, Math.sin(tt * 11)) * 0.25 : 0.5;
      shTR = working ? 0.95 + Math.max(0, Math.sin(tt * 11 + 1.6)) * 0.25 : 0.5;
    } else {
      shTL = -armSwing; shTR = armSwing;
    }
    if (shoL.current) shoL.current.rotation.x = damp(shoL.current.rotation.x, shTL, 10, dt);
    if (shoR.current) shoR.current.rotation.x = damp(shoR.current.rotation.x, shTR, 10, dt);

    if (rootRef.current) {
      // yurganda tabiiy yon-tebranish, turganda nozik chayqalish, blocked'da asabiy
      const sway = status === "blocked" ? Math.sin(tt * 20) * 0.02 : walk ? Math.sin(tt * 8) * 0.028 : Math.sin(tt * 0.7) * 0.01;
      rootRef.current.rotation.z = damp(rootRef.current.rotation.z, sway, walk ? 9 : 5, dt);
    }
  });

  const bottomMat = cloth(s.bottom), topMat = cloth(s.top), shoeMat = cloth(s.shoes);

  // Oyoq (son + tizza + boldir + poyabzal), hip pivotda
  const leg = (x: number, hipRef: React.RefObject<THREE.Group>, kneeRef: React.RefObject<THREE.Group>) => (
    <group ref={hipRef} position={[x, 0, 0]}>
      <VB p={[0, -0.2, 0]} s={[0.13, 0.42, 0.14]} m={bottomMat} />
      <group ref={kneeRef} position={[0, -0.4, 0]}>
        <VB p={[0, -0.2, 0]} s={[0.12, 0.42, 0.12]} m={bottomMat} />
        {/* poyabzal — tovoni orqada, tumshug'i OLDINGA (−z, yuz tomon) */}
        <VB p={[0, -0.42, -0.05]} s={[0.13, 0.1, 0.26]} m={shoeMat} />
      </group>
    </group>
  );

  // Qo'l (yelka pivot → bilak + kaft)
  const arm = (x: number, shoRef: React.RefObject<THREE.Group>) => (
    <group ref={shoRef} position={[x, 0.28, 0]}>
      <VB p={[0, -0.13, 0]} s={[0.1, 0.26, 0.1]} m={topMat} />
      <VB p={[0, -0.32, 0.02]} s={[0.09, 0.24, 0.09]} m={topMat} />
      <VB p={[0, -0.46, 0.03]} s={[0.09, 0.08, 0.09]} m={skin} />
    </group>
  );

  return (
    <group ref={rootRef}>
      <group ref={bodyRef} position={[0, 0.55, 0]}>
        {/* Tos */}
        <VB p={[0, 0, 0]} s={[0.34, 0.18, 0.26]} m={bottomMat} />
        {/* Oyoqlar (tos pastidan) */}
        {leg(-0.09, hipL, kneeL)}
        {leg(0.09, hipR, kneeR)}

        {/* Yuqori tana */}
        <group ref={upperRef} position={[0, 0.09, 0]}>
          <VB p={[0, 0.22, 0]} s={[0.36, 0.4, 0.24]} m={topMat} />
          {arm(-0.23, shoL)}
          {arm(0.23, shoR)}
          <VB p={[0, 0.45, 0]} s={[0.1, 0.08, 0.1]} m={skin} />
          <group ref={headRef} position={[0, 0.62, 0]}>
            <VB s={[0.3, 0.3, 0.3]} m={skin} />
            {/* ko'zlar (oq + qorachiq) */}
            {[-0.07, 0.07].map((x) => (
              <group key={x} position={[x, 0.025, -0.151]}>
                <VB s={[0.05, 0.055, 0.02]} m={EYE_WHITE} cast={false} />
                <VB p={[0, 0, -0.012]} s={[0.025, 0.03, 0.01]} m={EYE_PUPIL} cast={false} />
              </group>
            ))}
            {/* burun */}
            <VB p={[0, -0.03, -0.155]} s={[0.04, 0.05, 0.03]} m={skin} cast={false} />
            {/* quloqlar */}
            {[-0.157, 0.157].map((x) => <VB key={x} p={[x, 0.0, 0.01]} s={[0.03, 0.08, 0.08]} m={skin} />)}
            <Hair style={s.hairStyle} color={s.hair} />
            {s.accessory && <Accessory type={s.accessory} />}
          </group>
        </group>
      </group>

      {/* Holat halqasi — geometriya ulashilgan, material status rangi bo'yicha keshlangan */}
      <mesh ref={ringRef} position={[0, 1.75, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={RING_GEO} material={basicMat(STATUS_COLOR[status], { transparent: true, opacity: 0.9, side: THREE.DoubleSide })} />
    </group>
  );
}
