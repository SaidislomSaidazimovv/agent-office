import { READING_TOOLS } from "../core/constants.js";
import type { AgentStateStore } from "./agentStateStore.js";
import type { AgentState } from "./types.js";

// ── Umumiy holat amallari (transcriptParser + hookHandler ishlatadi) ──

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
