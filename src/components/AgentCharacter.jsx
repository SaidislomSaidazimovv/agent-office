import React, { Suspense, useEffect, useMemo, useRef } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { DEFAULT_CLIPS } from "../config.js";
import * as THREE from "three";

// ── GLB personaj: holat o'zgarganda animatsiyalar orasida
//    silliq crossfade qilinadi (0.35s).

function GlbCharacter({ def, state }) {
  const group = useRef();
  const { scene, animations } = useGLTF(def.glb);

  // Klonlash — bitta GLB ni bir nechta joyda ishlatish mumkin bo'lsin
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((m) => {
      if (m.isMesh || m.isSkinnedMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
      }
    });
    return c;
  }, [scene]);

  const { actions, mixer } = useAnimations(animations, group);
  const current = useRef(null);

  useEffect(() => {
    const clipMap = { ...DEFAULT_CLIPS, ...def.clips };
    const wanted = clipMap[state] || DEFAULT_CLIPS.idle;

    // Aniq nom topilmasa — qisman moslik (masalan "Armature|Typing")
    let action = actions[wanted];
    if (!action) {
      const key = Object.keys(actions).find((k) =>
        k.toLowerCase().includes(wanted.toLowerCase())
      );
      if (key) action = actions[key];
    }
    // Umuman topilmasa — birinchi mavjud klip
    if (!action) {
      const first = Object.values(actions)[0];
      action = first || null;
    }
    if (!action || current.current === action) return;

    action.reset().setLoop(THREE.LoopRepeat, Infinity);
    if (current.current) {
      current.current.crossFadeTo(action, 0.35, true);
      action.play();
    } else {
      action.fadeIn(0.2).play();
    }
    current.current = action;
  }, [state, actions, def.clips]);

  // Bloklangan holatda mixer tezligini biroz oshiramiz (asabiy effekt)
  useEffect(() => {
    if (mixer) mixer.timeScale = state === "blocked" ? 1.15 : 1.0;
  }, [state, mixer]);

  return (
    <group ref={group} scale={def.scale} position={[0, def.yOffset, 0]} rotation={[0, def.rotY, 0]}>
      <primitive object={cloned} />
    </group>
  );
}

// ── Fallback: GLB topilmasa ko'rsatiladigan sodda, ammo did bilan
//    yasalgan o'tirgan figura (modellar hali yuklanmagan bo'lsa ham
//    ofis ko'rkam ko'rinsin). Low-poly va arzon — 6× render bo'ladi.

// Holatga qarab yumshoq maslahat beruvchi indikator rangi
const STATE_TINT = {
  idle: "#8e8e93",
  thinking: "#5e9bff",
  working: "#30d158",
  review: "#bf5af2",
  blocked: "#ff453a",
  collab: "#ffd60a",
};

// Freym tezligidan mustaqil silliq yaqinlashish (exp damping)
function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function PlaceholderCharacter({ def, state }) {
  const c = def.fallbackColors;

  const rootRef = useRef();      // butun gavda: chayqalish / titrash
  const upperRef = useRef();     // bel bo'g'imidan yuqori tana: engashish
  const headRef = useRef();      // bosh: qimirlash / egilish
  const lForearm = useRef();     // chap bilak: yozish harakati
  const rForearm = useRef();     // o'ng bilak

  const t = useRef(Math.random() * 10); // fazani tasodifiy — hamma birxil qimirlamasin

  // Skin rangining biroz to'qroq varianti — soch/pastki lab uchun
  const hairColor = useMemo(() => {
    const col = new THREE.Color(c.top);
    col.offsetHSL(0, 0.05, -0.22);
    return `#${col.getHexString()}`;
  }, [c.top]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05); // katta sakrashlardan himoya
    t.current += dt;
    const tt = t.current;

    const working = state === "working" || state === "collab";
    const thinking = state === "thinking";
    const blocked = state === "blocked";
    const review = state === "review";

    // Nafas olish — barcha holatlarda mavjud, working'da tezroq
    const breatheSpeed = working ? 4.2 : blocked ? 5.5 : 1.6;
    const breathe = Math.sin(tt * breatheSpeed) * (working ? 0.012 : 0.02);

    // ── Yuqori tana engashishi ─────────────────────────────
    let leanX = 0.05;                 // dam olgan holat: biroz oldinga
    if (working) leanX = 0.26 + Math.sin(tt * 9) * 0.015; // stol tomon yozish uchun engashadi
    else if (thinking) leanX = -0.02; // biroz orqada, o'ychan
    else if (review) leanX = 0.14;    // ekranga qaraydi
    if (upperRef.current) {
      upperRef.current.rotation.x = damp(upperRef.current.rotation.x, leanX, 6, dt);
      upperRef.current.scale.y = damp(upperRef.current.scale.y, 1 + breathe, 8, dt);
    }

    // ── Bosh ───────────────────────────────────────────────
    let headTilt = 0;   // z — yon egilish
    let headNod = 0;    // x — pastga/yuqoriga
    const bob = Math.sin(tt * breatheSpeed + 0.4) * 0.02;
    if (thinking) { headTilt = 0.22; headNod = -0.08; }
    else if (working) { headNod = 0.22 + Math.sin(tt * 4.5) * 0.03; }
    else if (review) { headNod = 0.16; }
    else if (blocked) { headTilt = Math.sin(tt * 22) * 0.06; }
    if (headRef.current) {
      headRef.current.rotation.z = damp(headRef.current.rotation.z, headTilt, 6, dt);
      headRef.current.rotation.x = damp(headRef.current.rotation.x, headNod + bob, 7, dt);
    }

    // ── Bilaklar (yozish) ──────────────────────────────────
    let lType = 0, rType = 0;
    if (working) {
      // ikki qo'l almashib "tugma bosadi"
      lType = Math.max(0, Math.sin(tt * 11)) * 0.16;
      rType = Math.max(0, Math.sin(tt * 11 + 1.7)) * 0.16;
    }
    if (lForearm.current)
      lForearm.current.rotation.x = damp(lForearm.current.rotation.x, -lType, 12, dt);
    if (rForearm.current)
      rForearm.current.rotation.x = damp(rForearm.current.rotation.x, -rType, 12, dt);

    // ── Butun gavda: chayqalish / bloklangan titrash ───────
    if (rootRef.current) {
      let swayZ = Math.sin(tt * 0.6) * 0.015;   // idle nozik chayqalish
      let shakeX = 0;
      if (blocked) {
        swayZ = Math.sin(tt * 20) * 0.02;        // asabiy tebranish
        shakeX = Math.sin(tt * 31) * 0.006;
      } else if (thinking) {
        swayZ = Math.sin(tt * 0.9) * 0.03;       // sekin o'ychan chayqalish
      }
      rootRef.current.rotation.z = damp(rootRef.current.rotation.z, swayZ, 5, dt);
      rootRef.current.position.x = damp(rootRef.current.position.x, shakeX, 20, dt);
    }
  });

  // Bilak + kaft — bilak bo'g'imi tirsakda (yozish uchun ref bilan).
  // Oddiy funksiya (JSX komponenti emas) — holat o'zgarganda remount bo'lmaydi.
  const arm = (x, fref) => (
    <group position={[x, 0.36, 0.0]}>
      {/* yelka → tirsak (elka) */}
      <mesh position={[x > 0 ? 0.02 : -0.02, -0.16, -0.03]} rotation={[0.5, 0, x > 0 ? -0.12 : 0.12]} castShadow>
        <cylinderGeometry args={[0.055, 0.05, 0.28, 8]} />
        <meshStandardMaterial color={c.top} roughness={0.85} />
      </mesh>
      {/* tirsak bo'g'imi — bilak shu yerdan aylanadi */}
      <group ref={fref} position={[x > 0 ? 0.05 : -0.05, -0.30, -0.10]}>
        <mesh position={[0, 0, -0.13]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.05, 0.26, 8]} />
          <meshStandardMaterial color={c.top} roughness={0.85} />
        </mesh>
        {/* kaft */}
        <mesh position={[0, -0.01, -0.27]} castShadow>
          <sphereGeometry args={[0.05, 10, 8]} />
          <meshStandardMaterial color={c.skin} roughness={0.6} />
        </mesh>
      </group>
    </group>
  );

  return (
    <group ref={rootRef}>
      {/* ── Oyoqlar: stol ostida, oldinga (−z) cho'zilgan ── */}
      {[-0.09, 0.09].map((x) => (
        <group key={x}>
          {/* son — deyarli gorizontal, oldinga */}
          <mesh position={[x, 0.5, -0.2]} rotation={[Math.PI / 2 - 0.12, 0, 0]} castShadow>
            <cylinderGeometry args={[0.062, 0.058, 0.38, 10]} />
            <meshStandardMaterial color={c.pants} roughness={0.92} />
          </mesh>
          {/* boldir — pastga */}
          <mesh position={[x, 0.28, -0.39]} rotation={[0.05, 0, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.045, 0.46, 10]} />
            <meshStandardMaterial color={c.pants} roughness={0.92} />
          </mesh>
          {/* poyabzal */}
          <mesh position={[x, 0.055, -0.42]} castShadow>
            <boxGeometry args={[0.09, 0.06, 0.16]} />
            <meshStandardMaterial color={hairColor} roughness={0.8} />
          </mesh>
        </group>
      ))}

      {/* ── Tos / o'rindiqdagi asos ── */}
      <mesh position={[0, 0.58, -0.02]} castShadow>
        <boxGeometry args={[0.34, 0.18, 0.28]} />
        <meshStandardMaterial color={c.pants} roughness={0.92} />
      </mesh>

      {/* ── Beldan yuqori tana (engashadi) ── */}
      <group ref={upperRef} position={[0, 0.62, 0]}>
        {/* tana — pastdan yuqoriga ozgina toraygan */}
        <mesh position={[0, 0.22, 0.0]} castShadow>
          <cylinderGeometry args={[0.15, 0.19, 0.46, 14]} />
          <meshStandardMaterial color={c.top} roughness={0.85} />
        </mesh>
        {/* yelka kamari — gorizontal capsule */}
        <mesh position={[0, 0.4, 0.0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <capsuleGeometry args={[0.09, 0.26, 4, 12]} />
          <meshStandardMaterial color={c.top} roughness={0.85} />
        </mesh>

        {/* qo'llar */}
        {arm(-0.17, lForearm)}
        {arm(0.17, rForearm)}

        {/* bo'yin */}
        <mesh position={[0, 0.52, -0.01]} castShadow>
          <cylinderGeometry args={[0.05, 0.06, 0.09, 10]} />
          <meshStandardMaterial color={c.skin} roughness={0.6} />
        </mesh>

        {/* ── Bosh (qimirlaydi/egiladi) ── */}
        <group ref={headRef} position={[0, 0.62, -0.01]}>
          <mesh castShadow>
            <sphereGeometry args={[0.115, 18, 16]} />
            <meshStandardMaterial color={c.skin} roughness={0.55} />
          </mesh>
          {/* soch qalpoqchasi */}
          <mesh position={[0, 0.03, 0.01]} scale={[1.04, 0.9, 1.04]} castShadow>
            <sphereGeometry args={[0.118, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            <meshStandardMaterial color={hairColor} roughness={0.9} />
          </mesh>
        </group>
      </group>

      {/* ── Placeholder ekanini bildiruvchi past-profil indikator:
             holat rangida kichik, biroz shaffof disk ── */}
      <mesh position={[0, 1.5, -0.01]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.03, 0.05, 20]} />
        <meshBasicMaterial
          color={STATE_TINT[state] || STATE_TINT.idle}
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

class ModelErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) { console.warn(`GLB topilmadi: ${this.props.glb}`, err.message); }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function AgentCharacter({ def, state }) {
  // Animatsiyali placeholder (useFrame ishlatadi) faqat BARQAROR error-fallback
  // sifatida ishlatiladi. Suspense fallback = null — shunda useFrame yuklanish
  // paytida (Suspense fallback pozitsiyasida) ishga tushmaydi va R3F frameloop'ni
  // buzmaydi. GLB fayllar yo'q → useGLTF darrov xato beradi → error boundary
  // barqaror placeholder'ni mount qiladi.
  return (
    <ModelErrorBoundary glb={def.glb} fallback={<PlaceholderCharacter def={def} state={state} />}>
      <Suspense fallback={null}>
        <GlbCharacter def={def} state={state} />
      </Suspense>
    </ModelErrorBoundary>
  );
}
