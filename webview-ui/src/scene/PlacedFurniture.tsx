import { useLayout } from "../layoutStore";
import { furnitureDef } from "./furniture";

// ── Foydalanuvchi joylashtirgan mebel + tahrir-yer (placement plane) ──

export default function PlacedFurniture() {
  const items = useLayout((s) => s.items);
  const editMode = useLayout((s) => s.editMode);
  const selectedId = useLayout((s) => s.selectedId);
  const paletteType = useLayout((s) => s.paletteType);
  const select = useLayout((s) => s.select);
  const place = useLayout((s) => s.place);

  return (
    <group>
      {/* Tahrir-yer: bo'sh polga bosilsa mebel qo'yiladi (yoki tanlovni bekor) */}
      {editMode && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.004, 0]}
          onClick={(e) => {
            e.stopPropagation();
            if (paletteType) place(e.point.x, e.point.z);
            else select(null);
          }}
        >
          <planeGeometry args={[46, 32]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {items.map((it) => {
        const def = furnitureDef(it.type);
        if (!def) return null;
        const sel = editMode && selectedId === it.id;
        const rad = Math.max(def.hx, def.hz);
        return (
          <group
            key={it.id}
            position={[it.x, 0, it.z]}
            rotation={[0, it.ry, 0]}
            onClick={editMode ? (e) => { e.stopPropagation(); select(it.id); } : undefined}
          >
            {def.render()}
            {sel && (
              <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[rad + 0.14, rad + 0.3, 28]} />
                <meshBasicMaterial color="#4c8bf5" transparent opacity={0.95} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
