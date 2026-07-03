import { create } from "zustand";

// ── Sahna agent holati ───────────────────────────────────────
// Server xabarlari flaglarни yangilaydi; `status` ular asosida hisoblanadi
// va 3D personaj animatsiyasини boshqaradi.

export type AgentStatus =
  | "idle"
  | "thinking"
  | "working"
  | "review"
  | "blocked"
  | "collab";

export interface AgentView {
  id: number;
  folderName: string;
  role?: string;
  task?: string;
  isExternal: boolean;
  seatIndex: number;
  // Xom flaglar
  active: boolean;
  awaitingInput: boolean;
  permission: boolean;
  reading: boolean;
  toolLabel?: string;
  activeToolCount: number;
  subagentCount: number;
  inputTokens: number;
  outputTokens: number;
  // Hisoblangan
  status: AgentStatus;
}

const READING = new Set(["Read", "Grep", "Glob", "LS", "NotebookRead", "WebFetch", "WebSearch"]);

function computeStatus(a: AgentView): AgentStatus {
  if (a.permission) return "review";
  if (!a.active && a.awaitingInput) return "review";
  if (!a.active) return "idle";
  if (a.subagentCount > 0) return "collab";
  if (a.activeToolCount > 0) return a.reading ? "thinking" : "working";
  return "thinking";
}

interface OfficeState {
  agents: Record<number, AgentView>;
  order: number[];
  selectedId: number | null;
  seatCount: number;
  soundEnabled: boolean;

  addAgent(meta: { id: number; folderName?: string; role?: string; task?: string; isExternal?: boolean }): void;
  removeAgent(id: number): void;
  setActive(id: number, active: boolean, awaitingInput?: boolean): void;
  setTool(id: number, toolName: string | undefined, label: string): void;
  toolDone(id: number): void;
  clearTools(id: number): void;
  setPermission(id: number, on: boolean): void;
  addSubagent(id: number): void;
  clearSubagent(id: number): void;
  setTokens(id: number, input: number, output: number): void;
  select(id: number | null): void;
  setSound(on: boolean): void;
}

function recompute(a: AgentView): AgentView {
  return { ...a, status: computeStatus(a) };
}

export const useOffice = create<OfficeState>((set, get) => ({
  agents: {},
  order: [],
  selectedId: null,
  seatCount: 6,
  soundEnabled: true,

  addAgent(meta) {
    set((s) => {
      if (s.agents[meta.id]) return s;
      // Bo'sh seat topamiz
      const used = new Set(Object.values(s.agents).map((a) => a.seatIndex));
      let seat = 0;
      while (used.has(seat) && seat < s.seatCount) seat++;
      const a: AgentView = {
        id: meta.id,
        folderName: meta.folderName ?? "loyiha",
        role: meta.role,
        task: meta.task,
        isExternal: meta.isExternal ?? false,
        seatIndex: seat % s.seatCount,
        active: false,
        awaitingInput: false,
        permission: false,
        reading: false,
        activeToolCount: 0,
        subagentCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        status: "idle",
      };
      return { agents: { ...s.agents, [meta.id]: recompute(a) }, order: [...s.order, meta.id] };
    });
  },

  removeAgent(id) {
    set((s) => {
      if (!s.agents[id]) return s;
      const agents = { ...s.agents };
      delete agents[id];
      return {
        agents,
        order: s.order.filter((x) => x !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
      };
    });
  },

  setActive(id, active, awaitingInput = false) {
    const a = get().agents[id];
    if (!a) return;
    set((s) => ({
      agents: {
        ...s.agents,
        [id]: recompute({
          ...a,
          active,
          awaitingInput,
          ...(active ? {} : { activeToolCount: 0, subagentCount: 0, toolLabel: undefined, permission: false }),
        }),
      },
    }));
  },

  setTool(id, toolName, label) {
    const a = get().agents[id];
    if (!a) return;
    set((s) => ({
      agents: {
        ...s.agents,
        [id]: recompute({
          ...a,
          active: true,
          activeToolCount: a.activeToolCount + 1,
          toolLabel: label,
          reading: toolName ? READING.has(toolName) : false,
        }),
      },
    }));
  },

  toolDone(id) {
    const a = get().agents[id];
    if (!a) return;
    set((s) => ({
      agents: {
        ...s.agents,
        [id]: recompute({ ...a, activeToolCount: Math.max(0, a.activeToolCount - 1) }),
      },
    }));
  },

  clearTools(id) {
    const a = get().agents[id];
    if (!a) return;
    set((s) => ({
      agents: {
        ...s.agents,
        [id]: recompute({ ...a, activeToolCount: 0, subagentCount: 0, toolLabel: undefined }),
      },
    }));
  },

  setPermission(id, on) {
    const a = get().agents[id];
    if (!a) return;
    set((s) => ({ agents: { ...s.agents, [id]: recompute({ ...a, permission: on }) } }));
  },

  addSubagent(id) {
    const a = get().agents[id];
    if (!a) return;
    set((s) => ({
      agents: { ...s.agents, [id]: recompute({ ...a, active: true, subagentCount: a.subagentCount + 1 }) },
    }));
  },

  clearSubagent(id) {
    const a = get().agents[id];
    if (!a) return;
    set((s) => ({
      agents: { ...s.agents, [id]: recompute({ ...a, subagentCount: Math.max(0, a.subagentCount - 1) }) },
    }));
  },

  setTokens(id, input, output) {
    const a = get().agents[id];
    if (!a) return;
    set((s) => ({ agents: { ...s.agents, [id]: { ...a, inputTokens: input, outputTokens: output } } }));
  },

  select(id) {
    set({ selectedId: id });
  },

  setSound(on) {
    set({ soundEnabled: on });
  },
}));
