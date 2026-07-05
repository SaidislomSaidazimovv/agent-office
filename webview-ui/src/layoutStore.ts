import { create } from "zustand";
import { type PackItem, parsePack, registerPacks } from "./scene/furniture";
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

export interface LayoutSnapshot {
  items: PlacedItem[];
  floorColor: string | null;
}

interface LayoutState {
  items: PlacedItem[];
  floorColor: string | null;
  packs: PackItem[];
  editMode: boolean;
  selectedId: string | null;
  paletteType: string | null;
  draggingId: string | null;
  dragStart: PlacedItem[] | null;
  past: PlacedItem[][];
  future: PlacedItem[][];

  setEditMode(on: boolean): void;
  setPalette(type: string | null): void;
  place(x: number, z: number): void;
  select(id: string | null): void;
  move(id: string, x: number, z: number): void;
  rotate(id: string): void;
  remove(id: string): void;
  setFloorColor(c: string | null): void;
  addPack(json: string): number;
  removePack(type: string): void;
  beginDrag(id: string): void;
  dragTo(x: number, z: number): void;
  endDrag(): void;
  loadLayout(snap: { items?: PlacedItem[]; floorColor?: string | null; packs?: PackItem[] }): void;
  exportJSON(): string;
  importJSON(text: string): boolean;
  clearAll(): void;
  undo(): void;
  redo(): void;
}

export const useLayout = create<LayoutState>((set, get) => {
  const save = () => send({ type: "saveLayout", items: get().items, floorColor: get().floorColor, packs: get().packs });
  // O'zgarishdan oldin tarixni saqlaydi, kelajakni tozalaydi, host'ga yuboradi.
  const commit = (items: PlacedItem[]) => {
    const prev = get().items;
    set((s) => ({ items, past: [...s.past, prev].slice(-50), future: [] }));
    save();
  };

  return {
    items: [],
    floorColor: null,
    packs: [],
    editMode: false,
    selectedId: null,
    paletteType: null,
    draggingId: null,
    dragStart: null,
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
    setFloorColor(c) {
      set({ floorColor: c });
      save();
    },

    // ── Tashqi asset paketlari ──
    addPack(json) {
      const items = parsePack(json);
      if (!items) return 0;
      registerPacks(items); // renderer ro'yxatiga
      // Bir xil type'larni almashtiramiz (yangilash)
      const byType = new Map(get().packs.map((p) => [p.type, p]));
      for (const it of items) byType.set(it.type, it);
      set({ packs: [...byType.values()] });
      save();
      return items.length;
    },
    removePack(type) {
      set({ packs: get().packs.filter((p) => p.type !== type) });
      save();
    },

    // ── Sudrab ko'chirish (drag) — harakat davomida tarixsiz, oxirida commit ──
    beginDrag(id) {
      set({ draggingId: id, selectedId: id, dragStart: get().items });
    },
    dragTo(x, z) {
      const id = get().draggingId;
      if (!id) return;
      set({ items: get().items.map((it) => (it.id === id ? { ...it, x: snap(x), z: snap(z) } : it)) });
    },
    endDrag() {
      const { draggingId, dragStart, items } = get();
      set({ draggingId: null, dragStart: null });
      if (!draggingId || !dragStart) return;
      const before = dragStart.find((it) => it.id === draggingId);
      const after = items.find((it) => it.id === draggingId);
      if (before && after && (before.x !== after.x || before.z !== after.z)) {
        set((s) => ({ past: [...s.past, dragStart].slice(-50), future: [] }));
        save();
      }
    },

    loadLayout(sn) {
      const packs = Array.isArray(sn.packs) ? sn.packs : [];
      if (packs.length) registerPacks(packs); // saqlangan paketlarni renderer'ga tiklaymiz
      set({
        items: Array.isArray(sn.items) ? sn.items : [],
        floorColor: typeof sn.floorColor === "string" ? sn.floorColor : null,
        packs,
        past: [],
        future: [],
      });
    },
    exportJSON() {
      return JSON.stringify({ items: get().items, floorColor: get().floorColor }, null, 2);
    },
    importJSON(text) {
      try {
        const o = JSON.parse(text);
        const items = Array.isArray(o?.items) ? o.items : Array.isArray(o) ? o : null;
        if (!items) return false;
        // Minimal tekshiruv
        const clean: PlacedItem[] = items
          .filter((it: PlacedItem) => it && typeof it.type === "string" && typeof it.x === "number" && typeof it.z === "number")
          .map((it: PlacedItem) => ({ id: it.id || newId(), type: it.type, x: it.x, z: it.z, ry: Number(it.ry) || 0 }));
        commit(clean);
        if (typeof o?.floorColor === "string") get().setFloorColor(o.floorColor);
        return true;
      } catch {
        return false;
      }
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
      save();
    },
    redo() {
      const { future, items, past } = get();
      if (!future.length) return;
      const next = future[0];
      set({ items: next, future: future.slice(1), past: [...past, items].slice(-50), selectedId: null });
      save();
    },
  };
});
