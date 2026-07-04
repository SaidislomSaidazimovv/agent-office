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

/** Agentning JORIY holatини tasvirlaydigan xabarlar (snapshot). Webview qайта
 *  yuklanганда VA yangi agent adopt qilinganда bir xil ishlatiladi — shunда
 *  butun tarixни qайта broadcast qilish shart emas. */
export function agentSnapshotMessages(a: AgentState): ServerMessage[] {
  const msgs: ServerMessage[] = [
    { type: "agentStatus", id: a.id, status: a.isWaiting ? "waiting" : "active" },
  ];
  if (a.inputTokens > 0 || a.outputTokens > 0) {
    msgs.push({ type: "agentTokenUsage", id: a.id, inputTokens: a.inputTokens, outputTokens: a.outputTokens, contextWindow: a.contextWindow });
  }
  if (!a.isWaiting && a.currentToolLabel) {
    msgs.push({ type: "agentToolStart", id: a.id, toolId: "restore", status: a.currentToolLabel, toolName: a.currentToolName });
  }
  for (const tid of a.subagentToolIds) {
    msgs.push({ type: "subagentToolStart", id: a.id, parentToolId: tid, toolId: tid, status: "Sub-agent" });
  }
  if (a.permissionActive) msgs.push({ type: "agentToolPermission", id: a.id });
  return msgs;
}

// ── Umumiy holat amallari (transcriptParser + hookHandler ishlatadi) ──

/** Heuristik ruxsat-taymer kechikishi (ms) yoki null (taymer kerak emas).
 *  • faqat "default" rejimда (bypass/auto tool so'ramaydi);
 *  • exempt (read-only/boshqaruv) toollarда null;
 *  • Edit/Write → tez (instant amallar), Bash/boshqa → sekin (uzoq bo'lishi mumkin). */
export function permissionDelayFor(name: string, mode: string): number | null {
  if (mode !== "default") return null;
  if (PERMISSION_EXEMPT_TOOLS.has(name)) return null;
  return INSTANT_WRITE_TOOLS.has(name) ? PERMISSION_TIMER_FAST_MS : PERMISSION_TIMER_SLOW_MS;
}

/** tool_use input'дан inson-o'qiydigan status yasaydi ("Read foo.ts"). */
export function formatToolStatus(name: string, input?: Record<string, unknown>): string {
  const i = input || {};
  const raw =
    (i.file_path as string) || (i.path as string) || (i.pattern as string) ||
    (i.command as string) || (i.url as string) || "";
  const base = typeof raw === "string" && raw ? raw.split(/[\\/]/).pop() || "" : "";
  const target = base ? " " + base.slice(0, 40) : "";
  return (name + target).trim();
}

export function isReadingTool(name: string): boolean {
  return READING_TOOLS.has(name);
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
