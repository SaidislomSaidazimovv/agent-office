import { PerspectiveCamera, PointerLockControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

// ── Ichkи "yurib kuzatish" (birinchi shaxs) rejimi ───────────
// Sичqoncha bilan qarash (bosib lock), WASD/strelkalar bilan yurish.
// Ofis chegарasida qoladi, ko'z balandligi ~1.65m.

const BOUND_X = 22.2;
const BOUND_Z = 15.2;
const EYE = 1.65;
const SPEED = 4.5;

export default function FirstPersonView() {
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const down = (e: KeyboardEvent) => (keys.current[e.code] = true);
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const dir = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());

  useFrame(({ camera }, delta) => {
    const k = keys.current;
    const step = SPEED * Math.min(delta, 0.05);
    camera.getWorldDirection(dir.current);
    dir.current.y = 0;
    dir.current.normalize();
    right.current.crossVectors(dir.current, camera.up).normalize();
    if (k["KeyW"] || k["ArrowUp"]) camera.position.addScaledVector(dir.current, step);
    if (k["KeyS"] || k["ArrowDown"]) camera.position.addScaledVector(dir.current, -step);
    if (k["KeyA"] || k["ArrowLeft"]) camera.position.addScaledVector(right.current, -step);
    if (k["KeyD"] || k["ArrowRight"]) camera.position.addScaledVector(right.current, step);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -BOUND_X, BOUND_X);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -BOUND_Z, BOUND_Z);
    camera.position.y = EYE;
  });

  return (
    <>
      <PerspectiveCamera makeDefault fov={72} position={[0, EYE, 8]} near={0.1} far={200} />
      <PointerLockControls />
    </>
  );
}
