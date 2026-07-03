import { Suspense } from "react";
import Prop, { ModelBoundary } from "../three/Prop";

// ── Xona bezaklari (GLB) ─────────────────────────────────────
// Prop auto-fit qiladi; joy/burchak skrinshot bilan sozlangan.
// Xona: pol y=0, shift y=3.7; orqa devor z=-6, old z=+6, chap x=-8.5, o'ng x=+8.5.
export default function Decor() {
  return (
    <ModelBoundary>
      <Suspense fallback={null}>
        {/* Polda (burchaklarda) */}
        <Prop url="/models/bookshelf_dark_wood_w_books.glb" fit={2.0} fitAxis="height" position={[-7.4, 0, -5]} rotation={[0, Math.PI / 4, 0]} />
        <Prop url="/models/data_center_server_rack.glb" fit={1.9} fitAxis="height" position={[7.4, 0, -5]} rotation={[0, -Math.PI / 4, 0]} />
        <Prop url="/models/water_cooler.glb" fit={1.2} fitAxis="height" position={[-7.6, 0, 5]} rotation={[0, Math.PI / 3, 0]} />
        <Prop url="/models/cactus_in_a_clay_pot.glb" fit={1.0} fitAxis="height" position={[7.6, 0, 5]} rotation={[0, 0, 0]} />
        <Prop url="/models/whiteboard_short_circuit_line_graph.glb" fit={1.5} fitAxis="width" position={[5, 0, 5.35]} rotation={[0, Math.PI, 0]} />

        {/* Devorda (ground=false) */}
        <Prop url="/models/world_map_color_3d_scan.glb" fit={1.9} fitAxis="width" position={[-2, 2.0, 5.9]} rotation={[0, Math.PI, 0]} ground={false} />
        <Prop url="/models/clock.glb" fit={0.55} fitAxis="max" position={[-5, 2.7, 5.85]} rotation={[0, Math.PI, 0]} ground={false} />
        <Prop url="/models/psx-style_cork_board_notes_polaroids__pins.glb" fit={1.4} fitAxis="width" position={[-8.35, 1.7, 0]} rotation={[0, Math.PI / 2, 0]} ground={false} />
        <Prop url="/models/air_conditioner.glb" fit={1.0} fitAxis="depth" position={[-5.5, 3.25, -5.89]} rotation={[0, Math.PI / 2, 0]} ground={false} />
        <Prop url="/models/television_wall-mounted.glb" fit={1.4} fitAxis="width" position={[8.35, 2.2, -3]} rotation={[0, -Math.PI / 2, 0]} ground={false} />

        {/* Shiftда osma chiroqlar (3×2 to'r) */}
        {[-5, 0, 5].map((x) =>
          [-3, 3].map((z) => (
            <Prop key={`lamp_${x}_${z}`} url="/models/hanging_led_lamp.glb" fit={0.8} fitAxis="max" position={[x, 3.2, z]} ground={false} />
          )),
        )}
      </Suspense>
    </ModelBoundary>
  );
}
