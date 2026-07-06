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
  // ── Sessiya statistikasi ──
  /** Umumiy tool chaqiruvlari (sessiya davomida). */
  toolCalls: number;
  /** Ish navbatlari — har idle→faol o'tish (taxminiy "turn"). */
  turns: number;
  /** Yig'ilgan faol vaqt (ms), joriy faol interval bundan tashqari. */
  activeMs: number;
  /** Joriy faol interval boshlangan payt (ms) yoki null (idle). */
  activeSince: number | null;
  // Hisoblangan
  status: AgentStatus;
}

// ── Faoliyat tasmasi (event log) ──────────────────────────────
export interface OfficeEvent {
  seq: number;
  at: number;
  who: string;
  text: string;
  color: string;
}
let evSeq = 0;
const MAX_EVENTS = 60;

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
  events: OfficeEvent[];
  selectedId: number | null;
  movingId: number | null;
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
  setMoving(id: number | null): void;
  reassignSeat(id: number, seatIndex: number): void;
  setSound(on: boolean): void;
}

function recompute(a: AgentView): AgentView {
  return { ...a, status: computeStatus(a) };
}

// Faoliyat tasmasiga yozuv qo'shadi (eng yangi boshda, MAX_EVENTS cheklovi).
function pushEvent(events: OfficeEvent[], who: string, text: string, color: string): OfficeEvent[] {
  const e: OfficeEvent = { seq: ++evSeq, at: Date.now(), who, text, color };
  const next = [e, ...events];
  return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
}

// idle↔faol o'tishda faol vaqt + navbat sonini yangilaydi.
function touchActive(a: AgentView, active: boolean, now: number): Partial<AgentView> {
  const wasActive = a.activeSince != null;
  if (active && !wasActive) return { activeSince: now, turns: a.turns + 1 };
  if (!active && wasActive) return { activeSince: null, activeMs: a.activeMs + (now - (a.activeSince as number)) };
  return {};
}

export const useOffice = create<OfficeState>((set, get) => ({
  agents: {},
  order: [],
  events: [],
  selectedId: null,
  movingId: null,
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
        toolCalls: 0,
        turns: 0,
        activeMs: 0,
        activeSince: null,
        status: "idle",
      };
      return {
        agents: { ...s.agents, [meta.id]: recompute(a) },
        order: [...s.order, meta.id],
        events: pushEvent(s.events, a.folderName, "ofisga qo'shildi", "#5e9bff"),
      };
    });
  },

  removeAgent(id) {
    set((s) => {
      const gone = s.agents[id];
      if (!gone) return s;
      const agents = { ...s.agents };
      delete agents[id];
      return {
        agents,
        order: s.order.filter((x) => x !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
        events: pushEvent(s.events, gone.folderName, "ofisdan chiqdi", "#8e8e93"),
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
          ...touchActive(a, active, Date.now()),
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
          ...touchActive(a, true, Date.now()),
          activeToolCount: a.activeToolCount + 1,
          toolCalls: a.toolCalls + 1,
          toolLabel: label,
          reading: toolName ? get().readingTools.has(toolName) : false,
        }),
      },
      events: pushEvent(s.events, a.folderName, label, "#30d158"),
    }));
  },

  toolDone(id) {
    const a = get().agents[id];
    if (!a) return;
    const count = Math.max(0, a.activeToolCount - 1);
    set((s) => ({
      agents: {
        ...s.agents,
        // Barcha tool tugasa — yorliqni ham tozalaymiz (eski "Edit x.ts" osilib qolmasin).
        [id]: recompute({ ...a, activeToolCount: count, ...(count === 0 ? { toolLabel: undefined, reading: false } : {}) }),
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
    set((s) => ({
      agents: { ...s.agents, [id]: recompute({ ...a, permission: on }) },
      events: on ? pushEvent(s.events, a.folderName, "ruxsat so'radi 🔔", "#ff9f0a") : s.events,
    }));
  },

  setBlocked(id, on) {
    const a = get().agents[id];
    if (!a) return;
    set((s) => ({
      agents: { ...s.agents, [id]: recompute({ ...a, blocked: on }) },
      events: on ? pushEvent(s.events, a.folderName, "bloklandi (xato) ⛔", "#ff453a") : s.events,
    }));
  },

  addSubagent(id, key) {
    const a = get().agents[id];
    if (!a || a.subagents.includes(key)) return;
    set((s) => ({
      agents: { ...s.agents, [id]: recompute({ ...a, active: true, subagents: [...a.subagents, key] }) },
      events: pushEvent(s.events, a.folderName, "sub-agent yolladi 🔧", "#ffd60a"),
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

  setMoving(id) {
    set({ movingId: id });
  },

  reassignSeat(id, seatIndex) {
    const a = get().agents[id];
    if (!a) return;
    set((s) => {
      const agents = { ...s.agents };
      // O'sha o'rindiqda boshqa agent bo'lsa — joylarni almashtiramiz (swap).
      const occupant = Object.values(agents).find((x) => x.seatIndex === seatIndex && x.id !== id);
      if (occupant) agents[occupant.id] = { ...occupant, seatIndex: a.seatIndex };
      agents[id] = { ...a, seatIndex };
      return { agents, movingId: null };
    });
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
