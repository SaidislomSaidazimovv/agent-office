import { SUBAGENT_TOOL_NAMES } from "../core/constants.js";
import { toolCat } from "../core/toolcat.js";
import type { AgentStateStore } from "./agentStateStore.js";
import { accumulateRole } from "./roleInference.js";
import { formatError, formatSubagent, formatToolStatus, markWaiting, setActive, setBlocked } from "./stateActions.js";
import type { AgentState } from "./types.js";

// ── Hook event handler ───────────────────────────────────────
// Claude Code hook payload'ini (hook_event_name + maydonlar) agent holatiga
// qo'llaydi. Hook rejimi ishonchli — kelgan zahoti JSONL heuristikasi o'chadi
// (agent.hookDelivered = true).

/** Barqaror JSON (kalitlar tartiblangan) — bir xil input bir xil kalit beradi. */
function stableStringify(v: unknown): string {
  try {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
    }
    return JSON.stringify(v) ?? "null";
  } catch {
    return "";
  }
}

// Imzo ajratgichi — unit-separator (U+001F). Tool nomi/inputда uchramaydi,
// lekin manba faylida XOM control-bayt yozmaymiz (grep/muharrir/git uchun toza).
const SIG_SEP = String.fromCharCode(0x1f);

/** Tool imzosi — name + input (PreToolUse va PostToolUse'da bir xil bo'ladi). */
function toolSig(name: string, input: unknown): string {
  return name + SIG_SEP + stableStringify(input);
}

/** PostToolUse — mos imzoli eng eski (FIFO) tool ID'ni navbatdan oladi. Imzo
 *  mos kelmasa (kamdan-kam) — leak bo'lmasin uchun eng eski istalgan toolni. */
function popHookTool(agent: AgentState, name: string, input: unknown): string | undefined {
  const sig = toolSig(name, input);
  const q = agent.hookToolQueue.get(sig);
  if (q && q.length) {
    const id = q.shift()!;
    if (!q.length) agent.hookToolQueue.delete(sig);
    return id;
  }
  for (const [k, list] of agent.hookToolQueue) {
    if (list.length) {
      const id = list.shift()!;
      if (!list.length) agent.hookToolQueue.delete(k);
      return id;
    }
  }
  return undefined;
}

export function handleHookEvent(
  store: AgentStateStore,
  agent: AgentState,
  raw: Record<string, unknown>,
): void {
  // BIRINCHI hook — JSONL rejimida boshlangan tool/ruxsat/taymer holatini
  // tozalaymiz. JSONL tool-id'lari (t-…) hook-id'lariga mos kelmaydi, shuning
  // uchun ularning tool_result'i endi e'tiborsiz qoladi va indikator OSILIB
  // qolar edi. Hook holatni qaytadan aniq xabar qiladi.
  if (!agent.hookDelivered) {
    agent.hookDelivered = true;
    if (agent.activeToolIds.size > 0 || agent.subagentToolIds.size > 0) {
      agent.activeToolIds.clear();
      agent.subagentToolIds.clear();
      agent.hookToolQueue.clear();
      agent.currentToolLabel = undefined;
      agent.currentToolName = undefined;
      store.broadcast({ type: "agentToolsClear", id: agent.id });
    }
    // JSONL heuristik taymerlari hook rejimida false-positive bermasin.
    if (agent.permissionTimer) {
      clearTimeout(agent.permissionTimer);
      agent.permissionTimer = undefined;
    }
    if (agent.waitingTimer) {
      clearTimeout(agent.waitingTimer);
      agent.waitingTimer = undefined;
    }
    if (agent.permissionActive) {
      agent.permissionActive = false;
      store.broadcast({ type: "agentToolPermissionClear", id: agent.id });
    }
  }
  const event = raw.hook_event_name as string;

  switch (event) {
    case "PreToolUse": {
      setActive(store, agent);
      const name = (raw.tool_name as string) || "Tool";
      const input = raw.tool_input as Record<string, unknown> | undefined;
      const runInBackground = !!(input && input.run_in_background);
      const status = formatToolStatus(name, input);
      if (!agent.roleManual) {
        const detected = accumulateRole(agent, name, input);
        if (detected) store.broadcast({ type: "agentRoleDetected", id: agent.id, role: detected });
      }
      const sig = toolSig(name, input);
      const isSub = SUBAGENT_TOOL_NAMES.has(name);
      const toolId = `${isSub ? "hook-sub" : "hook"}-${agent.hookToolCounter++}`;
      // Imzo bo'yicha navbatga qo'shamiz (parallel tool'lar biri ustiga biri yozmaydi)
      const q = agent.hookToolQueue.get(sig);
      if (q) q.push(toolId);
      else agent.hookToolQueue.set(sig, [toolId]);
      if (isSub) {
        const info = formatSubagent(input);
        agent.subagentToolIds.set(toolId, info);
        store.broadcast({ type: "subagentToolStart", id: agent.id, parentToolId: toolId, toolId, status, label: info.label, kind: info.kind });
      } else {
        agent.activeToolIds.add(toolId);
        agent.currentToolLabel = status;
        agent.currentToolName = name;
        agent.toolCats[toolCat(status)] = (agent.toolCats[toolCat(status)] ?? 0) + 1;
        store.broadcast({ type: "agentToolStart", id: agent.id, toolId, status, toolName: name, runInBackground });
      }
      break;
    }

    case "PostToolUse":
    case "PostToolUseFailure": {
      // Xato → bloklandi (sababi tool javobidan); muvaffaqiyat → tiklandi.
      const failed = event === "PostToolUseFailure";
      setBlocked(store, agent, failed, failed ? formatError(raw.tool_response ?? raw.error) : undefined);
      // Tool tugadi → ruxsat pufagini tozalaymiz (qotib qolmasin).
      if (agent.permissionActive) {
        agent.permissionActive = false;
        store.broadcast({ type: "agentToolPermissionClear", id: agent.id });
      }
      const name = (raw.tool_name as string) || "Tool";
      const toolId = popHookTool(agent, name, raw.tool_input);
      if (toolId) {
        if (agent.subagentToolIds.has(toolId)) {
          agent.subagentToolIds.delete(toolId);
          store.broadcast({ type: "subagentClear", id: agent.id, parentToolId: toolId });
        } else {
          agent.activeToolIds.delete(toolId);
          store.broadcast({ type: "agentToolDone", id: agent.id, toolId });
          // Barcha oddiy tool tugasa — joriy yorliqni tozalaymiz
          if (agent.activeToolIds.size === 0) {
            agent.currentToolLabel = undefined;
            agent.currentToolName = undefined;
          }
        }
      }
      break;
    }

    case "Stop":
      markWaiting(store, agent, false); // "Tugadi"
      break;

    case "Notification": {
      const msg = ((raw.message as string) || "").toLowerCase();
      // Aniq tasnif: permission FAQAT ruxsat-kalitlarda; waiting alohida;
      // noma'lum notification — soxta holat yasamaymiz (e'tiborsiz).
      if (/permission|approve|allow|grant|confirm/.test(msg)) {
        agent.permissionActive = true;
        store.broadcast({ type: "agentToolPermission", id: agent.id });
      } else if (/waiting|input|idle/.test(msg)) {
        markWaiting(store, agent, true); // "Kirish kutmoqda"
      }
      break;
    }

    case "UserPromptSubmit":
      setActive(store, agent); // yangi navbat boshlandi
      setBlocked(store, agent, false); // xato tozalandi
      break;

    case "SubagentStop": {
      for (const tid of [...agent.subagentToolIds.keys()]) {
        agent.subagentToolIds.delete(tid);
        store.broadcast({ type: "subagentClear", id: agent.id, parentToolId: tid });
      }
      break;
    }

    // SessionStart / SessionEnd — hayot-tsikli ViewProvider'da (agent yaratish/o'chirish)
    default:
      break;
  }
}
