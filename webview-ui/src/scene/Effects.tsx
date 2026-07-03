import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";

// ── Post-processing: Bloom (porlash) + Vignette (chekka to'qlik) ──
export default function Effects() {
  return (
    <EffectComposer multisampling={2}>
      <Bloom intensity={0.5} luminanceThreshold={0.92} luminanceSmoothing={0.25} mipmapBlur radius={0.6} />
      <Vignette offset={0.32} darkness={0.5} />
    </EffectComposer>
  );
}
