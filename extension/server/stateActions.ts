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
  // Har faol tool uchun bitta start — webview sanog'i server bilan aniq mos
  // keladi (real tool_id'lar), reload'dan keyin sanoq buzilmaydi/osilmaydi.
  if (!a.isWaiting && a.currentToolLabel) {
    const ids = a.activeToolIds.size > 0 ? [...a.activeToolIds] : ["restore"];
    for (const tid of ids) {
      msgs.push({ type: "agentToolStart", id: a.id, toolId: tid, status: a.currentToolLabel, toolName: a.currentToolName });
    }
  }
  for (const tid of a.subagentToolIds) {
    msgs.push({ type: "subagentToolStart", id: a.id, parentToolId: tid, toolId: tid, status: "Sub-agent" });
  }
  if (a.permissionActive) msgs.push({ type: "agentToolPermission", id: a.id });
  if (a.blocked) msgs.push({ type: "agentBlocked", id: a.id, blocked: true });
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

export function isReadingTool(name: string): boolean {
  return READING_TOOLS.has(name);
}

/** "Bloklangan" holatini o'rnatadi/tozalaydi (xato → qizil status). */
export function setBlocked(store: AgentStateStore, agent: AgentState, on: boolean): void {
  if (agent.blocked === on) return;
  agent.blocked = on;
  store.broadcast({ type: "agentBlocked", id: agent.id, blocked: on });
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
