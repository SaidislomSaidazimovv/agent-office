import { useOffice } from "../store";
import { SEAT_COUNT, seatFor } from "./roles";

// ── O'rindiq belgilarilari — agent ko'chirilayotganda ko'rinadi ──
// Bo'sh o'rindiq = yashil, band = to'q sariq (bosilsa joylar almashadi).

export default function SeatMarkers() {
  const movingId = useOffice((s) => s.movingId);
  const agents = useOffice((s) => s.agents);
  const reassign = useOffice((s) => s.reassignSeat);
  if (movingId == null) return null;

  const occupied = new Map<number, number>();
  for (const a of Object.values(agents)) occupied.set(a.seatIndex, a.id);
  const maxUsed = Math.max(SEAT_COUNT - 1, ...Object.values(agents).map((a) => a.seatIndex));
  const n = maxUsed + 3; // bir nechta bo'sh o'rindiq ham ko'rsatamiz

  const markers = [];
  for (let i = 0; i < n; i++) {
    const occ = occupied.get(i);
    if (occ === movingId) continue; // o'z joyini o'tkazib yuboramiz
    const s = seatFor(i);
    const color = occ != null ? "#ff9f0a" : "#30d158";
    markers.push(
      <mesh
        key={i}
        position={[s.x, 0.06, s.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => { e.stopPropagation(); reassign(movingId, i); }}
      >
        <ringGeometry args={[0.45, 0.72, 26]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} side={2} depthTest={false} />
      </mesh>,
    );
  }
  return <group>{markers}</group>;
}
