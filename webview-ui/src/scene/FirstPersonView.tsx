import { PerspectiveCamera, PointerLockControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { slide } from "./collision";

// ── Ichki "yurib kuzatish" (birinchi shaxs) + QATTIQ to'qnashuv ──
// Sichqoncha bilan qarash (bosib lock), WASD yurish. Devor/oyna/mebeldan
// o'tmaydi (AABB to'siqlar), devor bo'ylab sirg'anadi.

const BOUND_X = 22.4;
const BOUND_Z = 15.4;
const EYE = 1.65;
const SPEED = 4.2;
const RAD = 0.4;

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
  const move = useRef(new THREE.Vector3());

  useFrame(({ camera }, delta) => {
    const k = keys.current;
    const step = SPEED * Math.min(delta, 0.05);
    camera.getWorldDirection(dir.current);
    dir.current.y = 0;
    dir.current.normalize();
    right.current.crossVectors(dir.current, camera.up).normalize();

    move.current.set(0, 0, 0);
    if (k["KeyW"] || k["ArrowUp"]) move.current.add(dir.current);
    if (k["KeyS"] || k["ArrowDown"]) move.current.sub(dir.current);
    if (k["KeyA"] || k["ArrowLeft"]) move.current.sub(right.current);
    if (k["KeyD"] || k["ArrowRight"]) move.current.add(right.current);

    if (move.current.lengthSq() > 1e-6) {
      move.current.y = 0;
      move.current.normalize().multiplyScalar(step);
      const res = slide(camera.position.x, camera.position.z, move.current.x, move.current.z, RAD);
      camera.position.x = THREE.MathUtils.clamp(res.x, -BOUND_X, BOUND_X);
      camera.position.z = THREE.MathUtils.clamp(res.z, -BOUND_Z, BOUND_Z);
    }
    camera.position.y = EYE;
  });

  return (
    <>
      <PerspectiveCamera makeDefault fov={72} position={[0, EYE, 5.5]} near={0.1} far={200} />
      <PointerLockControls />
    </>
  );
}
