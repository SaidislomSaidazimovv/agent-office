import React from "react";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

// ── Yorug'lik sayqali (post-processing) ──────────────────────
// Bloom: yorqin narsalar (Atlas kristali, chiroq/nur oqimlari) yumshoq porlaydi.
// Vignette: chekkalarni biroz to'qlashtirib, e'tiborni markazga jamlaydi.
// multisampling=2 — yengil MSAA (tekis qirralar), tezlikni saqlaydi.
export default function Effects() {
  return (
    <EffectComposer multisampling={2} disableNormalPass>
      <Bloom
        intensity={0.5}
        luminanceThreshold={0.92}
        luminanceSmoothing={0.25}
        mipmapBlur
        radius={0.6}
      />
      <Vignette offset={0.32} darkness={0.5} eskil={false} />
    </EffectComposer>
  );
}
