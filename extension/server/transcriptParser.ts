import {
  CONTEXT_WINDOW_1M,
  contextWindowForModel,
  MAX_CONTEXT_TOKENS,
  SUBAGENT_TOOL_NAMES,
  TEXT_IDLE_DELAY_MS,
  TOOL_DONE_DELAY_MS,
} from "../core/constants.js";
import type { AgentStateStore } from "./agentStateStore.js";
import { accumulateRole } from "./roleInference.js";
import { formatToolStatus, markWaiting, permissionDelayFor, setActive, setBlocked } from "./stateActions.js";
import type { AgentState } from "./types.js";

// ── Transcript state machine (Pixel Agents §3a mantiqi) ──────
// Bitta JSONL qatorini o'qib, agent holatini yangilaydi va webview'ga
// mos ServerMessage'larni broadcast qiladi. Heuristik (JSONL) rejim.
// Agar agentga hook eventi kelgan bo'lsa (hookDelivered) — faqat token
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

function startPermissionTimer(store: AgentStateStore, agent: AgentState, delayMs: number): void {
  if (agent.permissionTimer) clearTimeout(agent.permissionTimer);
  agent.permissionTimer = setTimeout(() => {
    agent.permissionTimer = undefined;
    agent.permissionActive = true;
    store.broadcast({ type: "agentToolPermission", id: agent.id });
  }, delayMs);
}

/** Kutilayotgan ruxsatni bekor qiladi (taymer + faol holat). */
function clearPermission(store: AgentStateStore, agent: AgentState): void {
  if (agent.permissionTimer) {
    clearTimeout(agent.permissionTimer);
    agent.permissionTimer = undefined;
  }
  if (agent.permissionActive) {
    agent.permissionActive = false;
    store.broadcast({ type: "agentToolPermissionClear", id: agent.id });
  }
}

/** assistant xabaridan token usage'ni o'qib broadcast qiladi. */
function emitTokens(store: AgentStateStore, agent: AgentState, message: Record<string, unknown>): void {
  // Modelni aniqlab kontekst oynasini belgilaymiz (200k yoki 1M). Diqqat:
  // transcript `message.model` 1M-rejimda ham ba'zan oddiy "claude-opus-4-8"
  // beradi ([1m] belgisisiz), shu sababli modelni faqat MINIMUM sifatida
  // olamiz — asosiy ishonchli signal quyida: kuzatilgan token 200kdan oshsa,
  // bu aniq 1M-kontekst sessiya (avto-yuqorilaymiz).
  const model = message.model as string | undefined;
  if (model && model !== agent.model && model !== "<synthetic>") {
    agent.model = model;
    agent.contextWindow = Math.max(agent.contextWindow, contextWindowForModel(model));
  }
  const usage = message.usage as
    | { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
    | undefined;
  if (!usage) return;
  // Kontekst hajmi = kesh-lanmagan + kesh-o'qilgan + kesh-yaratilgan (aks holda
  // faqat delta ~0 chiqadi va health-bar noto'g'ri bo'ladi).
  const ctx = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  if (ctx > 0) agent.inputTokens = ctx;
  // Avto-aniqlash: kontekst 200kdan oshdi → 1M-rejim (model stringga ishonmaymiz).
  if (ctx > MAX_CONTEXT_TOKENS && agent.contextWindow < CONTEXT_WINDOW_1M) {
    agent.contextWindow = CONTEXT_WINDOW_1M;
  }
  agent.outputTokens += usage.output_tokens || 0;
  // Xarajat uchun — har navbat billing tokenlarini JAMLAYMIZ (kesh o'qish/yozish
  // har navbat alohida hisoblanadi; yig'indi = haqiqiy billed tokenlar).
  agent.billedInput += usage.input_tokens || 0;
  agent.billedCacheWrite += usage.cache_creation_input_tokens || 0;
  agent.billedCacheRead += usage.cache_read_input_tokens || 0;
  store.broadcast({
    type: "agentTokenUsage",
    id: agent.id,
    inputTokens: agent.inputTokens,
    outputTokens: agent.outputTokens,
    contextWindow: agent.contextWindow,
    model: agent.model,
    billedInput: agent.billedInput,
    billedCacheWrite: agent.billedCacheWrite,
    billedCacheRead: agent.billedCacheRead,
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

  // Ruxsat rejimini kuzatamiz (permission-mode satri yoki user satrida keladi).
  // default'dan boshqa (auto/bypassPermissions) — tool ruxsat so'ramaydi, shu
  // sababli kutilayotgan heuristik ruxsatni bekor qilamiz.
  if (typeof o.permissionMode === "string") {
    agent.permissionMode = o.permissionMode;
    if (agent.permissionMode !== "default") clearPermission(store, agent);
  }

  // Hook rejimi faol bo'lsa — JSONL'dan faqat tokenni o'qiymiz, qolgan
  // holat/tool/ruxsat/navbat mantiqi hook'larga topshiriladi (ishonchliroq).
  if (agent.hookDelivered) {
    if (type === "assistant" && message) emitTokens(store, agent, message);
    return;
  }

  // ── system: turn_duration = aniq "navbat tugadi" ──
  if (type === "system" && (o.subtype as string) === "turn_duration") {
    markWaiting(store, agent, false);
    return;
  }
  // ── system: api_error = agent bloklandi (xato) ──
  if (type === "system" && (o.subtype as string) === "api_error") {
    setBlocked(store, agent, true);
    return;
  }

  // ── assistant ──
  if (type === "assistant" && message && Array.isArray(message.content)) {
    const blocks = message.content as ToolUseBlock[];
    const toolUses = blocks.filter((b) => b && b.type === "tool_use");
    const hasText = blocks.some((b) => b && b.type === "text");
    const hasThinking = blocks.some((b) => b && (b.type === "thinking" || b.type === "redacted_thinking"));

    emitTokens(store, agent, message);

    if (toolUses.length > 0) {
      setActive(store, agent);
      agent.hadToolsInTurn = true;
      for (const tool of toolUses) {
        const toolId = tool.id || `t-${agent.id}-${agent.activeToolIds.size}`;
        const name = tool.name || "Tool";
        const status = formatToolStatus(name, tool.input);
        const runInBackground = !!(tool.input && tool.input.run_in_background);

        // Rolni faoliyatdan aniqlash (to'liq input — file_path qisqarmasidan avval)
        const detected = accumulateRole(agent, name, tool.input as Record<string, unknown> | undefined);
        if (detected) store.broadcast({ type: "agentRoleDetected", id: agent.id, role: detected });

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
          // Heuristik ruxsat-taymer — rejim + tool turiga qarab kechikish
          // (default emas / exempt / read-only → null → taymer yo'q).
          const delay = permissionDelayFor(name, agent.permissionMode);
          if (delay != null) startPermissionTimer(store, agent, delay);
        }
      }
      return;
    }

    // Fikrlash (thinking) — agent faol o'ylayapti (sukunat-taymer YO'Q).
    if (hasThinking) {
      setActive(store, agent);
    }
    // Faqat matn — navbat oxiriga yaqin: sukunat taymeri (idle heuristikasi).
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
        // Tool natijasi keldi — kutilayotgan ruxsatni bekor qilamiz
        clearPermission(store, agent);
        // Xato natija → bloklandi; toza natija → tiklandi.
        setBlocked(store, agent, toolResults.some((tr) => tr.is_error === true));
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
        setBlocked(store, agent, false); // yangi navbat — xato tozalandi
        agent.hadToolsInTurn = false;
      }
      return;
    }
    if (typeof content === "string" && content && !content.startsWith("<")) {
      // Yangi matn so'rov — yangi navbat boshlandi
      setActive(store, agent);
      setBlocked(store, agent, false);
      agent.hadToolsInTurn = false;
    }
    return;
  }
}

/** Fayl boshidan birinchi foydalanuvchi so'rovini (vazifa yorlig'i) oladi. */
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
