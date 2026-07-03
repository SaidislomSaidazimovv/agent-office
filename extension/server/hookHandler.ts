import { SUBAGENT_TOOL_NAMES } from "../core/constants.js";
import type { AgentStateStore } from "./agentStateStore.js";
import { formatToolStatus, markWaiting, setActive } from "./stateActions.js";
import type { AgentState } from "./types.js";

// ── Hook event handler ───────────────────────────────────────
// Claude Code hook payload'ини (hook_event_name + maydonlar) agent holatига
// qo'llaydi. Hook rejimi ishonchli — kelgan zahoti JSONL heuristikasi o'chadi
// (agent.hookDelivered = true).

export function handleHookEvent(
  store: AgentStateStore,
  agent: AgentState,
  raw: Record<string, unknown>,
): void {
  agent.hookDelivered = true;
  const event = raw.hook_event_name as string;

  switch (event) {
    case "PreToolUse": {
      setActive(store, agent);
      const name = (raw.tool_name as string) || "Tool";
      const input = raw.tool_input as Record<string, unknown> | undefined;
      const runInBackground = !!(input && input.run_in_background);
      const status = formatToolStatus(name, input);
      if (SUBAGENT_TOOL_NAMES.has(name)) {
        const toolId = `hook-sub-${agent.hookToolCounter++}`;
        agent.subagentToolIds.add(toolId);
        agent.currentHookToolId = toolId;
        store.broadcast({ type: "subagentToolStart", id: agent.id, parentToolId: toolId, toolId, status });
      } else {
        const toolId = `hook-${agent.hookToolCounter++}`;
        agent.activeToolIds.add(toolId);
        agent.currentHookToolId = toolId;
        agent.currentToolLabel = status;
        agent.currentToolName = name;
        store.broadcast({ type: "agentToolStart", id: agent.id, toolId, status, toolName: name, runInBackground });
      }
      break;
    }

    case "PostToolUse":
    case "PostToolUseFailure": {
      const toolId = agent.currentHookToolId;
      if (toolId) {
        if (agent.subagentToolIds.has(toolId)) {
          agent.subagentToolIds.delete(toolId);
          store.broadcast({ type: "subagentClear", id: agent.id, parentToolId: toolId });
        } else {
          agent.activeToolIds.delete(toolId);
          store.broadcast({ type: "agentToolDone", id: agent.id, toolId });
        }
        agent.currentHookToolId = undefined;
      }
      break;
    }

    case "Stop":
      markWaiting(store, agent, false); // "Tugadi"
      break;

    case "Notification": {
      const msg = ((raw.message as string) || "").toLowerCase();
      if (msg.includes("waiting") || msg.includes("input") || msg.includes("idle")) {
        markWaiting(store, agent, true); // "Kirish kutmoqda"
      } else {
        agent.permissionActive = true;
        store.broadcast({ type: "agentToolPermission", id: agent.id });
      }
      break;
    }

    case "UserPromptSubmit":
      setActive(store, agent); // yangi navbat boshlandi
      break;

    case "SubagentStop": {
      for (const tid of [...agent.subagentToolIds]) {
        agent.subagentToolIds.delete(tid);
        store.broadcast({ type: "subagentClear", id: agent.id, parentToolId: tid });
      }
      break;
    }

    // SessionStart / SessionEnd — hayot-tsikli ViewProvider'да (agent yaratish/o'chirish)
    default:
      break;
  }
}
