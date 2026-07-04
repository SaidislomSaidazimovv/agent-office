import { PerspectiveCamera, PointerLockControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

// ── Ichkи "yurib kuzatish" (birinchi shaxs) + TO'QNASHUV ─────
// Sичqoncha bilan qarash (bosib lock), WASD yurish. Har harakatда kamerадан
// nur (raycast) otiladi — devor/mebel ichидан o'tmaydi, devor bo'ylab sirg'anadi.

const BOUND_X = 22.2;
const BOUND_Z = 15.2;
const EYE = 1.65;
const SPEED = 4.2;
const RADIUS = 0.5; // kameradан to'siqgacha minimal masofa

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
  const ray = useRef(new THREE.Raycaster());
  const axisDir = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    const cam = state.camera;
    const k = keys.current;
    const step = SPEED * Math.min(delta, 0.05);

    cam.getWorldDirection(dir.current);
    dir.current.y = 0;
    dir.current.normalize();
    right.current.crossVectors(dir.current, cam.up).normalize();

    move.current.set(0, 0, 0);
    if (k["KeyW"] || k["ArrowUp"]) move.current.add(dir.current);
    if (k["KeyS"] || k["ArrowDown"]) move.current.sub(dir.current);
    if (k["KeyA"] || k["ArrowLeft"]) move.current.sub(right.current);
    if (k["KeyD"] || k["ArrowRight"]) move.current.add(right.current);

    if (move.current.lengthSq() > 1e-6) {
      move.current.y = 0;
      move.current.normalize().multiplyScalar(step);
      // O'qlar bo'yicha alohida — biri bloklansa, ikkinchisi bo'yicha sirg'anadi
      moveAxis(cam, "x");
      moveAxis(cam, "z");
    }

    cam.position.x = THREE.MathUtils.clamp(cam.position.x, -BOUND_X, BOUND_X);
    cam.position.z = THREE.MathUtils.clamp(cam.position.z, -BOUND_Z, BOUND_Z);
    cam.position.y = EYE;

    function moveAxis(camera: THREE.Camera, axis: "x" | "z") {
      const d = move.current[axis];
      if (Math.abs(d) < 1e-5) return;
      axisDir.current.set(0, 0, 0);
      axisDir.current[axis] = Math.sign(d);
      ray.current.set(camera.position, axisDir.current);
      ray.current.far = RADIUS + Math.abs(d);
      const hits = ray.current.intersectObjects(state.scene.children, true);
      const blocked = hits.some((h) => h.distance <= RADIUS + Math.abs(d));
      if (!blocked) camera.position[axis] += d;
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault fov={72} position={[0, EYE, 5.5]} near={0.1} far={200} />
      <PointerLockControls />
    </>
  );
}
