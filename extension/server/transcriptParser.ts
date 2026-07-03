import {
  PERMISSION_EXEMPT_TOOLS,
  PERMISSION_TIMER_DELAY_MS,
  READING_TOOLS,
  SUBAGENT_TOOL_NAMES,
  TEXT_IDLE_DELAY_MS,
  TOOL_DONE_DELAY_MS,
} from "../core/constants.js";
import type { AgentStateStore } from "./agentStateStore.js";
import type { AgentState } from "./types.js";

// ── Transcript state machine (Pixel Agents §3a mantiqi) ──────
// Bitta JSONL qatorini o'qib, agent holatини yangilaydi va webview'ga
// mos ServerMessage'larни broadcast qiladi. Faqat JSONL (heuristik) rejim;
// hook rejimi keyin qo'shiladi (o'shанда taymerlar o'chiriladi).

interface ToolUseBlock {
  type: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

/** tool_use input'дан inson-o'qiydigan status yasaydi ("Reading foo.ts"). */
function formatToolStatus(name: string, input?: Record<string, unknown>): string {
  const i = input || {};
  const raw =
    (i.file_path as string) || (i.path as string) || (i.pattern as string) ||
    (i.command as string) || (i.url as string) || "";
  const base = typeof raw === "string" && raw ? raw.split(/[\\/]/).pop() || "" : "";
  const target = base ? " " + base.slice(0, 40) : "";
  const verb = READING_TOOLS.has(name) ? name : name;
  return (verb + target).trim();
}

function setActive(store: AgentStateStore, agent: AgentState): void {
  if (agent.waitingTimer) {
    clearTimeout(agent.waitingTimer);
    agent.waitingTimer = undefined;
  }
  if (agent.isWaiting) {
    agent.isWaiting = false;
    store.broadcast({ type: "agentStatus", id: agent.id, status: "active" });
  }
}

function markWaiting(store: AgentStateStore, agent: AgentState, awaitingInput: boolean): void {
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
  agent.isWaiting = true;
  store.broadcast({ type: "agentToolsClear", id: agent.id });
  store.broadcast({ type: "agentStatus", id: agent.id, status: "waiting", awaitingInput });
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
    store.broadcast({ type: "agentToolPermission", id: agent.id });
  }, PERMISSION_TIMER_DELAY_MS);
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

    // Tokenlar
    const usage = message.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    if (usage) {
      // inputTokens = joriy kontekst hajmi (oxirgi xabar) — health-bar uchun.
      // outputTokens = jami ishlab chiqarilgan (faollik ko'rsatkichi).
      if (usage.input_tokens) agent.inputTokens = usage.input_tokens;
      agent.outputTokens += usage.output_tokens || 0;
      store.broadcast({
        type: "agentTokenUsage",
        id: agent.id,
        inputTokens: agent.inputTokens,
        outputTokens: agent.outputTokens,
      });
    }

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
        if (agent.permissionTimer) {
          clearTimeout(agent.permissionTimer);
          agent.permissionTimer = undefined;
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
