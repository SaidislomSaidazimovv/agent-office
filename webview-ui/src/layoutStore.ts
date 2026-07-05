import { create } from "zustand";
import { send } from "./transport";

// ── Layout editor holati ─────────────────────────────────────
// Foydalanuvchi joylashtirgan mebel + tahrir rejimi + undo/redo. Har o'zgarish
// host'ga saqlash uchun yuboriladi (~/.agent-office/layout.json).

export interface PlacedItem {
  id: string;
  type: string;
  x: number;
  z: number;
  ry: number;
}

const GRID = 0.5; // joylashtirish gridi (m)
const snap = (v: number) => Math.round(v / GRID) * GRID;
let idc = 0;
const newId = () => `it${Date.now().toString(36)}${(idc++).toString(36)}`;

interface LayoutState {
  items: PlacedItem[];
  editMode: boolean;
  selectedId: string | null;
  paletteType: string | null;
  past: PlacedItem[][];
  future: PlacedItem[][];

  setEditMode(on: boolean): void;
  setPalette(type: string | null): void;
  place(x: number, z: number): void;
  select(id: string | null): void;
  move(id: string, x: number, z: number): void;
  rotate(id: string): void;
  remove(id: string): void;
  loadItems(items: PlacedItem[]): void;
  clearAll(): void;
  undo(): void;
  redo(): void;
}

function persist(items: PlacedItem[]): void {
  send({ type: "saveLayout", items });
}

export const useLayout = create<LayoutState>((set, get) => {
  // O'zgarishdan oldin tarixni saqlaydi, kelajakni tozalaydi, host'ga yuboradi.
  const commit = (items: PlacedItem[]) => {
    const prev = get().items;
    set((s) => ({ items, past: [...s.past, prev].slice(-50), future: [] }));
    persist(items);
  };

  return {
    items: [],
    editMode: false,
    selectedId: null,
    paletteType: null,
    past: [],
    future: [],

    setEditMode(on) {
      set({ editMode: on, selectedId: null, paletteType: on ? get().paletteType : null });
    },
    setPalette(type) {
      set({ paletteType: type, selectedId: null });
    },
    place(x, z) {
      const type = get().paletteType;
      if (!type) return;
      const item: PlacedItem = { id: newId(), type, x: snap(x), z: snap(z), ry: 0 };
      commit([...get().items, item]);
      set({ selectedId: item.id });
    },
    select(id) {
      set({ selectedId: id });
    },
    move(id, x, z) {
      commit(get().items.map((it) => (it.id === id ? { ...it, x: snap(x), z: snap(z) } : it)));
    },
    rotate(id) {
      commit(get().items.map((it) => (it.id === id ? { ...it, ry: (it.ry + Math.PI / 4) % (Math.PI * 2) } : it)));
    },
    remove(id) {
      commit(get().items.filter((it) => it.id !== id));
      set((s) => ({ selectedId: s.selectedId === id ? null : s.selectedId }));
    },
    loadItems(items) {
      // Persistensiyadan yuklash — tarixsiz, saqlashsiz.
      set({ items: Array.isArray(items) ? items : [], past: [], future: [] });
    },
    clearAll() {
      commit([]);
      set({ selectedId: null });
    },
    undo() {
      const { past, items, future } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({ items: prev, past: past.slice(0, -1), future: [items, ...future].slice(0, 50), selectedId: null });
      persist(prev);
    },
    redo() {
      const { future, items, past } = get();
      if (!future.length) return;
      const next = future[0];
      set({ items: next, future: future.slice(1), past: [...past, items].slice(-50), selectedId: null });
      persist(next);
    },
  };
});
