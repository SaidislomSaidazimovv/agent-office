import { create } from "zustand";
import { MAX_CONTEXT_TOKENS, SEAT_COUNT } from "./scene/roles";

// ── Sahna agent holati ───────────────────────────────────────
// Server xabarlari flaglarni yangilaydi; `status` ular asosida hisoblanadi
// va 3D personaj animatsiyasini boshqaradi.

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
  blocked: boolean;
  reading: boolean;
  toolLabel?: string;
  activeToolCount: number;
  /** Faol sub-agentlar (parentToolId kalitlari) — har biri alohida personaj. */
  subagents: string[];
  inputTokens: number;
  outputTokens: number;
  /** Shu sessiya modeli uchun kontekst oynasi (200k yoki 1M). */
  contextWindow: number;
  // Hisoblangan
  status: AgentStatus;
}

// Standart "reading" toollar — host `providerCapabilities` yuborsa yangilanadi
// (bitta manba, takror emas).
const DEFAULT_READING = ["Read", "Grep", "Glob", "LS", "NotebookRead", "WebFetch", "WebSearch"];

function computeStatus(a: AgentView): AgentStatus {
  if (a.permission) return "review";
  if (a.blocked) return "blocked"; // xato — e'tibor talab qiladi (qizil)
  if (!a.active && a.awaitingInput) return "review";
  if (!a.active) return "idle";
  // Ota-agentning O'Z ishi ustuvor — subagent bo'lsa ham kod yozayotgan bo'lsa
  // "working" ko'rinsin (subagent personajlari baribir yonida ko'rinadi).
  // "collab" faqat ota bo'sh (subagentlarni kutayotgan) holatda.
  if (a.activeToolCount > 0) return a.reading ? "thinking" : "working";
  if (a.subagents.length > 0) return "collab";
  return "thinking";
}

export type CameraMode = "iso" | "fpv";

interface OfficeState {
  agents: Record<number, AgentView>;
  order: number[];
  selectedId: number | null;
  seatCount: number;
  soundEnabled: boolean;
  hookActive: boolean;
  readingTools: Set<string>;
  folders: { name: string; path: string }[];
  cameraMode: CameraMode;
  setCameraMode(m: CameraMode): void;

  addAgent(meta: { id: number; folderName?: string; role?: string; task?: string; isExternal?: boolean }): void;
  removeAgent(id: number): void;
  setActive(id: number, active: boolean, awaitingInput?: boolean): void;
  setTool(id: number, toolName: string | undefined, label: string): void;
  toolDone(id: number): void;
  clearTools(id: number): void;
  setPermission(id: number, on: boolean): void;
  setBlocked(id: number, on: boolean): void;
  addSubagent(id: number, key: string): void;
  clearSubagent(id: number, key: string): void;
  setTokens(id: number, input: number, output: number, contextWindow?: number): void;
  setCapabilities(readingTools: string[]): void;
  setFolders(folders: { name: string; path: string }[]): void;
  setHookActive(active: boolean): void;
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
  seatCount: SEAT_COUNT,
  soundEnabled: true,
  hookActive: false,
  readingTools: new Set(DEFAULT_READING),
  folders: [],
  cameraMode: "iso",
  setCameraMode(m) {
    set({ cameraMode: m });
  },

  addAgent(meta) {
    set((s) => {
      if (s.agents[meta.id]) return s;
      // Birinchi BO'SH o'rin indeksini topamiz (chegarasiz — hech qachon
      // ustma-ust tushmaydi; SEATS tugasa seatFor() qo'shimcha joy beradi).
      const used = new Set(Object.values(s.agents).map((a) => a.seatIndex));
      let seat = 0;
      while (used.has(seat)) seat++;
      const a: AgentView = {
        id: meta.id,
        folderName: meta.folderName ?? "loyiha",
        role: meta.role,
        task: meta.task,
        isExternal: meta.isExternal ?? false,
        seatIndex: seat,
        active: false,
        awaitingInput: false,
        permission: false,
        blocked: false,
        reading: false,
        activeToolCount: 0,
        subagents: [],
        inputTokens: 0,
        outputTokens: 0,
        contextWindow: MAX_CONTEXT_TOKENS,
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
          ...(active ? {} : { activeToolCount: 0, subagents: [], toolLabel: undefined, permission: false }),
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
          reading: toolName ? get().readingTools.has(toolName) : false,
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
        [id]: recompute({ ...a, activeToolCount: 0, subagents: [], toolLabel: undefined }),
      },
    }));
  },

  setPermission(id, on) {
    const a = get().agents[id];
    if (!a) return;
    set((s) => ({ agents: { ...s.agents, [id]: recompute({ ...a, permission: on }) } }));
  },

  setBlocked(id, on) {
    const a = get().agents[id];
    if (!a) return;
    set((s) => ({ agents: { ...s.agents, [id]: recompute({ ...a, blocked: on }) } }));
  },

  addSubagent(id, key) {
    const a = get().agents[id];
    if (!a || a.subagents.includes(key)) return;
    set((s) => ({
      agents: { ...s.agents, [id]: recompute({ ...a, active: true, subagents: [...a.subagents, key] }) },
    }));
  },

  clearSubagent(id, key) {
    const a = get().agents[id];
    if (!a) return;
    set((s) => ({
      agents: { ...s.agents, [id]: recompute({ ...a, subagents: a.subagents.filter((k) => k !== key) }) },
    }));
  },

  setTokens(id, input, output, contextWindow) {
    const a = get().agents[id];
    if (!a) return;
    set((s) => ({ agents: { ...s.agents, [id]: { ...a, inputTokens: input, outputTokens: output, contextWindow: contextWindow ?? a.contextWindow } } }));
  },

  select(id) {
    set({ selectedId: id });
  },

  setSound(on) {
    set({ soundEnabled: on });
  },

  setCapabilities(readingTools) {
    if (readingTools && readingTools.length > 0) set({ readingTools: new Set(readingTools) });
  },

  setFolders(folders) {
    set({ folders: folders ?? [] });
  },

  setHookActive(active) {
    set({ hookActive: active });
  },
}));
