import { create } from "zustand";
import type { Key } from "./i18n";
import { estimateCost } from "./pricing";
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
  /** Ruxsatni JUDA uzoq (3+ daqiqa) kutmoqda — e'tibordan chetda qolgan. */
  stuck: boolean;
  reading: boolean;
  toolLabel?: string;
  activeToolCount: number;
  /** Faol sub-agentlar — har biri alohida personaj + daraxt tuguni. */
  subagents: SubagentView[];
  inputTokens: number;
  outputTokens: number;
  /** Shu sessiya modeli uchun kontekst oynasi (200k yoki 1M). */
  contextWindow: number;
  /** Sessiya modeli (xarajat + ko'rsatish uchun). */
  model?: string;
  /** Taxminiy sessiya xarajati ($, billing tokenlaridan hisoblangan). */
  costUsd: number;
  // ── Sessiya statistikasi ──
  /** Umumiy tool chaqiruvlari (sessiya davomida). */
  toolCalls: number;
  /** Ish navbatlari — har idle→faol o'tish (taxminiy "turn"). */
  turns: number;
  /** Yig'ilgan faol vaqt (ms), joriy faol interval bundan tashqari. */
  activeMs: number;
  /** Joriy faol interval boshlangan payt (ms) yoki null (idle). */
  activeSince: number | null;
  /** So'nggi tool chaqiruvlari (eng yangi boshda, cheklangan) — inspektor tarixi. */
  toolHistory: { label: string; at: number }[];
  // Hisoblangan
  status: AgentStatus;
}

// ── Sub-agent (Task tool) ────────────────────────────────────
// Ma'lumot HAQIQIY: `label` — Task tool'ining `description` maydoni,
// `kind` — `subagent_type`. Ikkalasi ham bo'lmasligi mumkin (eski transkriptlar,
// boshqa provayder) — unda UI umumiy "Yordamchi" nomini ko'rsatadi.
export interface SubagentView {
  /** parentToolId — barqaror kalit. */
  key: string;
  label?: string;
  kind?: string;
  /** Yollangan payt (ms). */
  at: number;
}

const MAX_TOOL_HISTORY = 24;

// ── Faoliyat tasmasi (event log) ──────────────────────────────
export interface OfficeEvent {
  seq: number;
  at: number;
  who: string;
  /** i18n kaliti (tarjima render'da — reaktiv). */
  key?: Key;
  /** Tarjimasiz to'g'ridan-to'g'ri matn (masalan tool yorlig'i). */
  text?: string;
  /** Sub-agent ×N hisoblagichi. */
  count?: number;
  color: string;
}
let evSeq = 0;
const MAX_EVENTS = 60;

// Sub-agent minimal ko'rinish vaqti — background (async) subagentlar ota
// transkriptida ~0.5s'da yopiladi. Ular ko'zga ilinishi uchun kamida shuncha
// vaqt ko'rinib tursin (qachon qo'shilgani → key bo'yicha).
const SUBAGENT_MIN_MS = 6000;
const subAddedAt = new Map<string, number>();
const subKey = (id: number, key: string) => `${id}:${key}`;

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

// ── Xarajat/token vaqt qatori (dashboard grafigi uchun) ──────
// MUAMMO: store faqat JORIY jamini biladi — "vaqt bo'yicha xarajat" grafigi
// uchun TARIX kerak, u esa yo'q edi. YECHIM: davriy namuna olish (ring buffer).
// Bu HAQIQIY o'lchangan ma'lumot — hech narsa to'qib chiqarilmaydi.
export interface CostSample {
  /** Namuna olingan payt (ms). */
  t: number;
  /** Jami taxminiy xarajat ($) — shu paytдa. */
  cost: number;
  /** Jami kirish / chiqish tokenlari. */
  inTok: number;
  outTok: number;
  /** Shu paytдa faol agentlar soni. */
  active: number;
}
/** ~1 soat (10s oralig'ida 360 namuna). Ring buffer — eskisi tushib ketadi. */
const MAX_SAMPLES = 360;

interface OfficeState {
  agents: Record<number, AgentView>;
  order: number[];
  events: OfficeEvent[];
  /** Xarajat/token vaqt qatori (10s'da bir namuna). */
  samples: CostSample[];
  selectedId: number | null;
  movingId: number | null;
  seatCount: number;
  soundEnabled: boolean;
  hookActive: boolean;
  readingTools: Set<string>;
  folders: { name: string; path: string }[];
  /** Papka nomi → git holati (branch + o'zgargan fayllar). */
  gitRepos: Record<string, { branch?: string; changed: number }>;
  cameraMode: CameraMode;
  setCameraMode(m: CameraMode): void;

  /** Joriy jamini vaqt qatoriga yozadi (10s'da bir marta chaqiriladi). */
  sample(): void;
  /** Tizim hodisasi (agentga bog'liq emas) — masalan budjet ogohlantirishi. */
  notifyEvent(who: string, color: string, key: Key): void;

  addAgent(meta: { id: number; folderName?: string; role?: string; task?: string; isExternal?: boolean }): void;
  removeAgent(id: number): void;
  setActive(id: number, active: boolean, awaitingInput?: boolean): void;
  setTool(id: number, toolName: string | undefined, label: string): void;
  setRole(id: number, role: string): void;
  toolDone(id: number): void;
  clearTools(id: number): void;
  setPermission(id: number, on: boolean): void;
  setBlocked(id: number, on: boolean): void;
  setStuck(id: number, on: boolean): void;
  addSubagent(id: number, key: string, info?: { label?: string; kind?: string }): void;
  clearSubagent(id: number, key: string): void;
  setTokens(id: number, input: number, output: number, contextWindow?: number, cost?: { model?: string; billedInput?: number; billedCacheWrite?: number; billedCacheRead?: number }): void;
  setCapabilities(readingTools: string[]): void;
  setFolders(folders: { name: string; path: string }[]): void;
  setGitRepos(repos: { name: string; branch?: string; changed: number }[]): void;
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
function pushEvent(events: OfficeEvent[], who: string, color: string, payload: { key?: Key; text?: string; count?: number }): OfficeEvent[] {
  const e: OfficeEvent = { seq: ++evSeq, at: Date.now(), who, color, ...payload };
  const next = [e, ...events];
  return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
}

// Sub-agent yollash hodisasini BIRLASHTIRADI: agar eng yangi yozuv shu agentning
// yaqinda yollagan yozuvi bo'lsa — yangi qator emas, "×N" hisoblagichini oshiradi
// (bir vaqtda 3 yordamchi yollasa feed 3 marta takrorlanmasin).
function pushSubHire(events: OfficeEvent[], who: string): OfficeEvent[] {
  const top = events[0];
  if (top && top.who === who && top.key === "event.subHire" && Date.now() - top.at < 8000) {
    const n = (top.count ?? 1) + 1;
    const updated: OfficeEvent = { seq: ++evSeq, at: Date.now(), who, color: "#ffd60a", key: "event.subHire", count: n };
    return [updated, ...events.slice(1)];
  }
  return pushEvent(events, who, "#ffd60a", { key: "event.subHire", count: 1 });
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
  samples: [],
  selectedId: null,
  movingId: null,
  seatCount: SEAT_COUNT,
  soundEnabled: true,
  hookActive: false,
  readingTools: new Set(DEFAULT_READING),
  folders: [],
  gitRepos: {},
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
        stuck: false,
        reading: false,
        activeToolCount: 0,
        subagents: [],
        inputTokens: 0,
        outputTokens: 0,
        contextWindow: MAX_CONTEXT_TOKENS,
        costUsd: 0,
        toolCalls: 0,
        turns: 0,
        activeMs: 0,
        activeSince: null,
        toolHistory: [],
        status: "idle",
      };
      return {
        agents: { ...s.agents, [meta.id]: recompute(a) },
        order: [...s.order, meta.id],
        events: pushEvent(s.events, a.folderName, "#5e9bff", { key: "event.joined" }),
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
        events: pushEvent(s.events, gone.folderName, "#8e8e93", { key: "event.left" }),
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
          // Yangi navbat boshlandi → ruxsat kutish (va "tiqilib qolgan" holati) tugadi.
          ...(active ? { stuck: false } : { activeToolCount: 0, subagents: [], toolLabel: undefined, permission: false, stuck: false }),
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
          toolHistory: [{ label, at: Date.now() }, ...a.toolHistory].slice(0, MAX_TOOL_HISTORY),
          reading: toolName ? get().readingTools.has(toolName) : false,
        }),
      },
      events: pushEvent(s.events, a.folderName, "#30d158", { text: label }),
    }));
  },

  setRole(id, role) {
    const a = get().agents[id];
    if (!a || a.role === role) return;
    // Rol o'zgardi → ko'rinish (skin) + yorliq avtomatik yangilanadi.
    set((s) => ({ agents: { ...s.agents, [id]: { ...a, role } } }));
  },

  sample() {
    const s = get();
    // Agent yo'q bo'lsa namuna olmaymiz — grafikni bo'sh nollar bilan
    // to'ldirmaslik uchun (aks holda "0$" tekislik cho'ziladi).
    if (s.order.length === 0) return;
    let cost = 0, inTok = 0, outTok = 0, active = 0;
    for (const id of s.order) {
      const a = s.agents[id];
      if (!a) continue;
      cost += a.costUsd;
      inTok += a.inputTokens;
      outTok += a.outputTokens;
      if (a.active) active++;
    }
    const smp: CostSample = { t: Date.now(), cost, inTok, outTok, active };
    set((st) => {
      const next = [...st.samples, smp];
      return { samples: next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next };
    });
  },

  notifyEvent(who, color, key) {
    set((s) => ({ events: pushEvent(s.events, who, color, { key }) }));
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
      events: on ? pushEvent(s.events, a.folderName, "#ff9f0a", { key: "event.permission" }) : s.events,
    }));
  },

  setBlocked(id, on) {
    const a = get().agents[id];
    if (!a) return;
    set((s) => ({
      agents: { ...s.agents, [id]: recompute({ ...a, blocked: on }) },
      events: on ? pushEvent(s.events, a.folderName, "#ff453a", { key: "event.blocked" }) : s.events,
    }));
  },

  setStuck(id, on) {
    const a = get().agents[id];
    if (!a || a.stuck === on) return;
    set((s) => ({
      agents: { ...s.agents, [id]: { ...a, stuck: on } },
      events: on ? pushEvent(s.events, a.folderName, "#ff9f0a", { key: "event.stuck" }) : s.events,
    }));
  },

  addSubagent(id, key, info) {
    const a = get().agents[id];
    if (!a || a.subagents.some((s) => s.key === key)) return;
    const now = Date.now();
    subAddedAt.set(subKey(id, key), now);
    const sub: SubagentView = { key, label: info?.label || undefined, kind: info?.kind, at: now };
    set((s) => ({
      agents: { ...s.agents, [id]: recompute({ ...a, active: true, ...touchActive(a, true, now), subagents: [...a.subagents, sub] }) },
      events: pushSubHire(s.events, a.folderName),
    }));
  },

  clearSubagent(id, key) {
    const a = get().agents[id];
    if (!a || !a.subagents.some((s) => s.key === key)) return;
    // Minimal ko'rinish vaqti — juda tez yopilsa (background), qolgan vaqtga
    // qadar kechiktiramiz (flash bo'lmasin, foydalanuvchi ko'rib ulgursin).
    const k = subKey(id, key);
    const elapsed = Date.now() - (subAddedAt.get(k) ?? 0);
    const remove = () => {
      subAddedAt.delete(k);
      const cur = get().agents[id];
      if (!cur || !cur.subagents.some((x) => x.key === key)) return;
      set((s) => ({
        agents: { ...s.agents, [id]: recompute({ ...cur, subagents: cur.subagents.filter((x) => x.key !== key) }) },
        events: pushEvent(s.events, cur.folderName, "#30d158", { key: "event.helperDone" }),
      }));
    };
    if (elapsed >= SUBAGENT_MIN_MS) remove();
    else setTimeout(remove, SUBAGENT_MIN_MS - elapsed);
  },

  setTokens(id, input, output, contextWindow, cost) {
    const a = get().agents[id];
    if (!a) return;
    const model = cost?.model ?? a.model;
    const costUsd = cost
      ? estimateCost(model, { input: cost.billedInput ?? 0, cacheWrite: cost.billedCacheWrite ?? 0, cacheRead: cost.billedCacheRead ?? 0, output })
      : a.costUsd;
    set((s) => ({ agents: { ...s.agents, [id]: { ...a, inputTokens: input, outputTokens: output, contextWindow: contextWindow ?? a.contextWindow, model, costUsd } } }));
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

  setGitRepos(repos) {
    set({ gitRepos: Object.fromEntries((repos ?? []).map((r) => [r.name, { branch: r.branch, changed: r.changed }])) });
  },

  setHookActive(active) {
    set({ hookActive: active });
  },
}));
