import { useTexture } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { asset } from "../assets";

// ── ambientCG PBR tekstura yuklovchi ─────────────────────────
// models/<folder>/<folder>_Color.png (+ _NormalGL, _Roughness) ni yuklaydi.
// Har chaqiruv o'z nusxasини oladi (repeat to'qnashmasin).
// Qaytaradi: { map, normalMap, roughnessMap } — <meshStandardMaterial>ga.
export function useACGTextures(
  folder: string,
  repeat: [number, number] = [1, 1],
): Record<string, THREE.Texture> {
  const base = asset(`models/${folder}/${folder}`);
  const loaded = useTexture({
    map: `${base}_Color.png`,
    normalMap: `${base}_NormalGL.png`,
    roughnessMap: `${base}_Roughness.png`,
  }) as unknown as Record<string, THREE.Texture>;

  const [rx, ry] = repeat;
  return useMemo(() => {
    const out: Record<string, THREE.Texture> = {};
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
