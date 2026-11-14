import { type ReactNode, useLayoutEffect, useRef } from "react";
import type * as THREE from "three";
import { batchStatic, unbatch } from "./batching";

// ── <StaticBatch> — bolalardagi statik mesh'larni birlashtiradi ──
// Bolalar oddiydek yoziladi (komponentlar, React holati). Commit'dan keyin
// statik mesh'lar bir nechta birlashgan mesh'ga aylantiriladi (batching.ts),
// asl mesh'lar yashiriladi. `deps` o'zgarsa (masalan devor rangi mavzusi) —
// birlashma bekor qilinib, yangi ranglar bilan qayta quriladi.
// Dinamik qismlar (animatsiya, kun/tun) `userData={{ noBatch: true }}` bilan
// belgilanishi SHART — aks holda ularning keyingi o'zgarishi ko'rinmaydi.

export function StaticBatch({ children, deps = [] }: { children: ReactNode; deps?: unknown[] }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    const r = batchStatic(g);
    return () => unbatch(g, r);
    // deps — chaqiruvchi beradi (statik bolalarning ko'rinishini o'zgartiradigan qiymatlar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return <group ref={ref}>{children}</group>;
}
