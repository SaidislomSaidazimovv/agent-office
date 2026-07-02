import React, { Suspense, useEffect, useMemo, useRef } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
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

// ── Fallback: GLB topilmasa ko'rsatiladigan sodda figura
//    (loyiha modellar hali yuklanmagan bo'lsa ham ishlashi uchun)

function PlaceholderCharacter({ def, state }) {
  const c = def.fallbackColors;
  const headRef = useRef();
  return (
    <group>
      {/* stulda o'tirgan sodda gavda */}
      <mesh position={[0, 0.62, 0.02]} castShadow>
        <boxGeometry args={[0.32, 0.16, 0.26]} />
        <meshStandardMaterial color={c.pants} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.92, 0.02]} castShadow>
        <cylinderGeometry args={[0.15, 0.18, 0.5, 14]} />
        <meshStandardMaterial color={c.top} roughness={0.9} />
      </mesh>
      <mesh ref={headRef} position={[0, 1.32, 0]} castShadow>
        <sphereGeometry args={[0.11, 18, 14]} />
        <meshStandardMaterial color={c.skin} roughness={0.6} />
      </mesh>
      {[-0.085, 0.085].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.55, -0.18]} rotation={[Math.PI / 2 - 0.1, 0, 0]} castShadow>
            <cylinderGeometry args={[0.055, 0.05, 0.36, 10]} />
            <meshStandardMaterial color={c.pants} roughness={0.9} />
          </mesh>
          <mesh position={[x, 0.28, -0.36]} castShadow>
            <cylinderGeometry args={[0.045, 0.04, 0.44, 10]} />
            <meshStandardMaterial color={c.pants} roughness={0.9} />
          </mesh>
        </group>
      ))}
      {/* GLB yo'qligini bildiruvchi belgi */}
      <mesh position={[0, 1.75, 0]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshBasicMaterial color="#ff9f0a" />
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
  const fallback = <PlaceholderCharacter def={def} state={state} />;
  return (
    <ModelErrorBoundary glb={def.glb} fallback={fallback}>
      <Suspense fallback={fallback}>
        <GlbCharacter def={def} state={state} />
      </Suspense>
    </ModelErrorBoundary>
  );
}
