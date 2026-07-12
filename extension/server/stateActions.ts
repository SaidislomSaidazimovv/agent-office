import {
  INSTANT_WRITE_TOOLS,
  PERMISSION_EXEMPT_TOOLS,
  PERMISSION_TIMER_FAST_MS,
  PERMISSION_TIMER_SLOW_MS,
  READING_TOOLS,
} from "../core/constants.js";
import type { ServerMessage } from "../core/messages.js";
import type { AgentStateStore } from "./agentStateStore.js";
import type { AgentState } from "./types.js";

/** Agentning JORIY holatini tasvirlaydigan xabarlar (snapshot). Webview qayta
 *  yuklanganda VA yangi agent adopt qilinganda bir xil ishlatiladi — shunda
 *  butun tarixni qayta broadcast qilish shart emas. */
export function agentSnapshotMessages(a: AgentState): ServerMessage[] {
  const msgs: ServerMessage[] = [
    { type: "agentStatus", id: a.id, status: a.isWaiting ? "waiting" : "active" },
  ];
  if (a.inputTokens > 0 || a.outputTokens > 0) {
    msgs.push({ type: "agentTokenUsage", id: a.id, inputTokens: a.inputTokens, outputTokens: a.outputTokens, contextWindow: a.contextWindow });
  }
  // Har REAL faol tool uchun bitta start — webview sanog'i server bilan aniq mos
  // keladi va tugaganda to'g'ri tozalanadi (sun'iy "restore" id'siz — u hech
  // qachon mos kelmay osilib qolardi).
  if (!a.isWaiting && a.currentToolLabel && a.activeToolIds.size > 0) {
    for (const tid of a.activeToolIds) {
      msgs.push({ type: "agentToolStart", id: a.id, toolId: tid, status: a.currentToolLabel, toolName: a.currentToolName });
    }
  }
  // Sub-agentlar — saqlangan tavsif bilan qayta tiklanadi (webview qayta ochilsa
  // ham daraxt to'liq ko'rinadi; avval umumiy "Sub-agent" yozuvi ketardi).
  for (const [tid, info] of a.subagentToolIds) {
    msgs.push({ type: "subagentToolStart", id: a.id, parentToolId: tid, toolId: tid, status: "Task", label: info.label, kind: info.kind });
  }
  if (a.permissionActive) msgs.push({ type: "agentToolPermission", id: a.id });
  if (a.blocked) msgs.push({ type: "agentBlocked", id: a.id, blocked: true, reason: a.blockedReason });
  return msgs;
}

// ── Umumiy holat amallari (transcriptParser + hookHandler ishlatadi) ──

/** Heuristik ruxsat-taymer kechikishi (ms) yoki null (taymer kerak emas).
 *  • faqat "default" rejimda (bypass/auto tool so'ramaydi);
 *  • exempt (read-only/boshqaruv) toollarda null;
 *  • Edit/Write → tez (instant amallar), Bash/boshqa → sekin (uzoq bo'lishi mumkin). */
export function permissionDelayFor(name: string, mode: string): number | null {
  if (mode !== "default") return null;
  if (PERMISSION_EXEMPT_TOOLS.has(name)) return null;
  return INSTANT_WRITE_TOOLS.has(name) ? PERMISSION_TIMER_FAST_MS : PERMISSION_TIMER_SLOW_MS;
}

/** tool_use input'dan inson-o'qiydigan status yasaydi ("Read foo.ts"). */
export function formatToolStatus(name: string, input?: Record<string, unknown>): string {
  const i = input || {};
  // Yo'l (file_path/path) → faqat fayl nomini olamiz. Buyruq/pattern/url → to'liq
  // (basename QILMAYMIZ — "git commit -m ..." yoki "cd src/app" buzilib qolmasin).
  const p = (i.file_path as string) || (i.path as string);
  let target = "";
  if (typeof p === "string" && p) {
    target = " " + (p.split(/[\\/]/).pop() || "").slice(0, 40);
  } else {
    const other = (i.command as string) || (i.pattern as string) || (i.url as string) || "";
    if (typeof other === "string" && other) target = " " + other.replace(/\s+/g, " ").trim().slice(0, 40);
  }
  return (name + target).trim();
}

/** Sub-agent (Task/Agent tool) haqidagi HAQIQIY ma'lumot — o'ylab topilmaydi. */
export interface SubagentInfo {
  /** `description` maydoni ("Find flaky tests"). Bo'lmasa — bo'sh (UI umumiy nom qo'yadi). */
  label: string;
  /** `subagent_type` ("code-reviewer", "Explore"). Bo'lmasa — undefined. */
  kind?: string;
}

/** Task/Agent tool input'idan sub-agent tavsifini oladi (transcript + hook uchun bir xil). */
export function formatSubagent(input?: Record<string, unknown>): SubagentInfo {
  const i = input || {};
  const d = i.description;
  const k = i.subagent_type;
  return {
    label: typeof d === "string" ? d.replace(/\s+/g, " ").trim().slice(0, 60) : "",
    kind: typeof k === "string" && k.trim() ? k.trim().slice(0, 32) : undefined,
  };
}

export function isReadingTool(name: string): boolean {
  return READING_TOOLS.has(name);
}

/** Xato natijasidan qisqa, o'qiladigan SABAB matni ("npm ERR! 404 …").
 *  tool_result mazmuni satr ham, bloklar ro'yxati ham bo'lishi mumkin. */
export const MAX_ERROR_LEN = 180;
export function formatError(content: unknown): string {
  let s = "";
  if (typeof content === "string") {
    s = content;
  } else if (Array.isArray(content)) {
    s = content
      .map((b) => (b && typeof b === "object" && typeof (b as { text?: unknown }).text === "string" ? (b as { text: string }).text : ""))
      .join(" ");
  }
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > MAX_ERROR_LEN ? `${s.slice(0, MAX_ERROR_LEN - 1)}…` : s;
}

/** "Bloklangan" holatini o'rnatadi/tozalaydi (xato → qizil status).
 *  `reason` — HAQIQIY xato matni (transkript/hook'dan). Bo'lmasa — undefined. */
export function setBlocked(store: AgentStateStore, agent: AgentState, on: boolean, reason?: string): void {
  const r = on ? reason || undefined : undefined;
  if (agent.blocked === on && agent.blockedReason === r) return;
  agent.blocked = on;
  agent.blockedReason = r;
  store.broadcast({ type: "agentBlocked", id: agent.id, blocked: on, reason: r });
}

export function setActive(store: AgentStateStore, agent: AgentState): void {
  if (agent.waitingTimer) {
    clearTimeout(agent.waitingTimer);
    agent.waitingTimer = undefined;
  }
  if (agent.isWaiting) {
    agent.isWaiting = false;
    store.broadcast({ type: "agentStatus", id: agent.id, status: "active" });
  }
}

export function markWaiting(store: AgentStateStore, agent: AgentState, awaitingInput: boolean): void {
  if (agent.waitingTimer) {
    clearTimeout(agent.waitingTimer);
    agent.waitingTimer = undefined;
  }
  if (agent.permissionTimer) {
    clearTimeout(agent.permissionTimer);
    agent.permissionTimer = undefined;
  }
  agent.hadToolsInTurn = false;
  agent.activeToolIds.clear();
  agent.subagentToolIds.clear();
  agent.hookToolQueue.clear();
  agent.currentToolLabel = undefined;
  agent.currentToolName = undefined;
  agent.permissionActive = false;
  agent.isWaiting = true;
  store.broadcast({ type: "agentToolsClear", id: agent.id });
  store.broadcast({ type: "agentStatus", id: agent.id, status: "waiting", awaitingInput });
}
