import { useTexture } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

// ── ambientCG PBR tekstura yuklovchi ─────────────────────────
// public/models/<folder>/<folder>_Color.png (+ _NormalGL, _Roughness) ni yuklaydi.
// Yassi yuzalar uchun AO/Displacement o'tkazib yuboriladi (kerak emas, arzon).
// Har chaqiruv o'z tekstura nusxasini oladi (repeat to'qnashmasin).
//
// Qaytaradi: { map, normalMap, roughnessMap } — <meshStandardMaterial> ga tarqatiladi.
export function useACGTextures(folder, repeat = [1, 1]) {
  const base = `/models/${folder}/${folder}`;
  const loaded = useTexture({
    map: `${base}_Color.png`,
    normalMap: `${base}_NormalGL.png`,
    roughnessMap: `${base}_Roughness.png`,
  });

  const [rx, ry] = repeat;
  return useMemo(() => {
    const out = {};
    for (const [key, tex] of Object.entries(loaded)) {
      const t = tex.clone();
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.anisotropy = 8;
      t.colorSpace = key === "map" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      out[key] = t;
    }
    return out;
  }, [loaded, rx, ry]);
}
