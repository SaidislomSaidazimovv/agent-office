import {
  PERMISSION_EXEMPT_TOOLS,
  PERMISSION_TIMER_DELAY_MS,
  SUBAGENT_TOOL_NAMES,
  TEXT_IDLE_DELAY_MS,
  TOOL_DONE_DELAY_MS,
} from "../core/constants.js";
import type { AgentStateStore } from "./agentStateStore.js";
import { formatToolStatus, markWaiting, setActive } from "./stateActions.js";
import type { AgentState } from "./types.js";

// ── Transcript state machine (Pixel Agents §3a mantiqi) ──────
// Bitta JSONL qatorini o'qib, agent holatини yangilaydi va webview'ga
// mos ServerMessage'larни broadcast qiladi. Heuristik (JSONL) rejim.
// Agar agentga hook eventи kelgan bo'lsa (hookDelivered) — faqat token
// o'qiladi, qolgani hook rejimiga topshiriladi (ishonchliroq).

interface ToolUseBlock {
  type: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

function startWaitingTimer(store: AgentStateStore, agent: AgentState): void {
  if (agent.waitingTimer) clearTimeout(agent.waitingTimer);
  agent.waitingTimer = setTimeout(() => {
    agent.waitingTimer = undefined;
    markWaiting(store, agent, false);
  }, TEXT_IDLE_DELAY_MS);
}

function startPermissionTimer(store: AgentStateStore, agent: AgentState): void {
  if (agent.permissionTimer) clearTimeout(agent.permissionTimer);
  agent.permissionTimer = setTimeout(() => {
    agent.permissionTimer = undefined;
    agent.permissionActive = true;
    store.broadcast({ type: "agentToolPermission", id: agent.id });
  }, PERMISSION_TIMER_DELAY_MS);
}

/** assistant xabaridan token usage'ни o'qib broadcast qiladi. */
function emitTokens(store: AgentStateStore, agent: AgentState, message: Record<string, unknown>): void {
  const usage = message.usage as { input_tokens?: number; output_tokens?: number } | undefined;
  if (!usage) return;
  if (usage.input_tokens) agent.inputTokens = usage.input_tokens;
  agent.outputTokens += usage.output_tokens || 0;
  store.broadcast({
    type: "agentTokenUsage",
    id: agent.id,
    inputTokens: agent.inputTokens,
    outputTokens: agent.outputTokens,
  });
}

/** Bitta transcript qatorini qayta ishlaydi. */
export function processTranscriptLine(
  store: AgentStateStore,
  agent: AgentState,
  line: string,
): void {
  if (!line.trim()) return;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(line);
  } catch {
    return;
  }
  const type = o.type as string;
  const message = o.message as Record<string, unknown> | undefined;

  // Hook rejimi faol bo'lsa — JSONL'дан faqat tokenni o'qiymiz, qolgan
  // holat/tool/ruxsat/navbat mantiqi hook'ларга topshiriladi (ishonchliroq).
  if (agent.hookDelivered) {
    if (type === "assistant" && message) emitTokens(store, agent, message);
    return;
  }

  // ── system: turn_duration = aniq "navbat tugadi" ──
  if (type === "system" && (o.subtype as string) === "turn_duration") {
    markWaiting(store, agent, false);
    return;
  }

  // ── assistant ──
  if (type === "assistant" && message && Array.isArray(message.content)) {
    const blocks = message.content as ToolUseBlock[];
    const toolUses = blocks.filter((b) => b && b.type === "tool_use");
    const hasText = blocks.some((b) => b && b.type === "text");

    emitTokens(store, agent, message);

    if (toolUses.length > 0) {
      setActive(store, agent);
      agent.hadToolsInTurn = true;
      for (const tool of toolUses) {
        const toolId = tool.id || `t-${agent.id}-${agent.activeToolIds.size}`;
        const name = tool.name || "Tool";
        const status = formatToolStatus(name, tool.input);
        const runInBackground = !!(tool.input && tool.input.run_in_background);

        if (SUBAGENT_TOOL_NAMES.has(name)) {
          agent.subagentToolIds.add(toolId);
          store.broadcast({
            type: "subagentToolStart",
            id: agent.id,
            parentToolId: toolId,
            toolId,
            status,
          });
        } else {
          agent.activeToolIds.add(toolId);
          agent.currentToolLabel = status;
          agent.currentToolName = name;
          store.broadcast({
            type: "agentToolStart",
            id: agent.id,
            toolId,
            status,
            toolName: name,
            runInBackground,
          });
          // Ruxsat talab qilishi mumkin bo'lgan tool — heuristik taymer
          if (!PERMISSION_EXEMPT_TOOLS.has(name)) startPermissionTimer(store, agent);
        }
      }
      return;
    }

    // Faqat matn (yoki thinking) — navbat oxiriga yaqin: sukunat taymeri
    if (hasText) {
      setActive(store, agent);
      if (!agent.hadToolsInTurn) startWaitingTimer(store, agent);
    }
    return;
  }

  // ── user ──
  if (type === "user" && message) {
    const content = message.content;
    if (Array.isArray(content)) {
      const toolResults = content.filter(
        (b: ToolUseBlock) => b && b.type === "tool_result",
      ) as Array<ToolUseBlock & { tool_use_id?: string; is_error?: boolean }>;
      if (toolResults.length > 0) {
        // Ruxsat berildi — permission taymerini bekor qilamiz
        if (agent.permissionTimer || agent.permissionActive) {
          clearTimeout(agent.permissionTimer);
          agent.permissionTimer = undefined;
          agent.permissionActive = false;
          store.broadcast({ type: "agentToolPermissionClear", id: agent.id });
        }
        for (const tr of toolResults) {
          const toolId = tr.tool_use_id || "";
          if (agent.subagentToolIds.has(toolId)) {
            agent.subagentToolIds.delete(toolId);
            store.broadcast({ type: "subagentClear", id: agent.id, parentToolId: toolId });
          } else if (agent.activeToolIds.has(toolId)) {
            agent.activeToolIds.delete(toolId);
            setTimeout(() => {
              store.broadcast({ type: "agentToolDone", id: agent.id, toolId });
            }, TOOL_DONE_DELAY_MS);
          }
        }
        return;
      }
      // Yangi foydalanuvchi so'rovi (tool_result emas) — yangi navbat
      const hasText = content.some((b: ToolUseBlock) => b && b.type === "text");
      if (hasText) {
        setActive(store, agent);
        agent.hadToolsInTurn = false;
      }
      return;
    }
    if (typeof content === "string" && content && !content.startsWith("<")) {
      // Yangi matn so'rov — yangi navbat boshlandi
      setActive(store, agent);
      agent.hadToolsInTurn = false;
    }
    return;
  }
}

/** Fayl boshidan birinchi foydalanuvchi so'rovини (vazifa yorlig'i) oladi. */
export function extractFirstTask(headText: string): string {
  for (const line of headText.split("\n")) {
    if (!line) continue;
    try {
      const o = JSON.parse(line);
      if (o.type === "user" && o.message) {
        const c = o.message.content;
        const s =
          typeof c === "string"
            ? c
            : Array.isArray(c)
              ? (c.find((b: ToolUseBlock) => b.type === "text") as { text?: string })?.text || ""
              : "";
        if (s && !s.startsWith("<")) return s.replace(/\s+/g, " ").slice(0, 60);
      }
    } catch {
      /* skip */
    }
  }
  return "Claude Code sessiya";
}
