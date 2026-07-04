// ── Server-tomon agent holati ────────────────────────────────
// Har bir kuzatilayotgan Claude Code sessiyasi = bitta AgentState.

import { MAX_CONTEXT_TOKENS } from "../core/constants.js";

export interface AgentState {
  /** Monoton o'suvchi butun ID (webview personajи shu bilan kalitlanadi). */
  id: number;
  /** Kuzatilayotgan .jsonl transcript fayl yo'li. */
  filePath: string;
  /** Faylда o'qilgan bayt (keyingi polling shu yerdan davom etadi). */
  fileOffset: number;
  /** Qism-qator buferi (bitta o'qishда yarim qator qolsa). */
  lineBuffer: string;
  /** Claude sessiya ID (hook eventларини yo'naltirish uchun). */
  sessionId?: string;
  /** Loyiha papka nomi (ko'rsatish uchun). */
  folderName: string;
  /** Foydalanuvchi tanlagan rol (research/frontend/...) yoki avto. */
  role?: string;
  /** Boshlang'ich vazifa yorlig'i. */
  task?: string;
  /** VS Code terminali tomonidan yaratilganmi yoki tashqi sessiya. */
  isExternal: boolean;

  // ── Faoliyat holati ──
  /** Hozir navbatда tool ishlatilganmi (idle-heuristikaсi uchun). */
  hadToolsInTurn: boolean;
  /** Agent kutish holatidami ("Done"/"Waiting"). */
  isWaiting: boolean;
  /** Faol tool ID'lari. */
  activeToolIds: Set<string>;
  /** Foydali toollar (sub-agent Task ID'lari). */
  subagentToolIds: Set<string>;
  /** Joriy tool yorlig'i/nomi + ruxsat holati — webview qayta yuklanганда
   *  holatни tiklash uchun saqlanadi. */
  currentToolLabel?: string;
  currentToolName?: string;
  permissionActive: boolean;

  // ── Hook rejimi ──
  /** Bu agentga hook eventи kelgan — JSONL heuristikasi o'chiriladi. */
  hookDelivered: boolean;
  /** PreToolUse → PostToolUse mosligи. Hook payloadда tool_use_id YO'Q, shu
   *  sababли tool imzosи (name + input) bo'yicha moslaymiz. Imzo → FIFO tool
   *  ID'lari (bir xil imzoли parallel tool'lар uchun navbat). Parallel tool'лар
   *  endi to'g'ri yopiladi (biri ustiga biri yozib qo'ymaydi). */
  hookToolQueue: Map<string, string[]>;
  /** Hook tool ID hisoblagichи. */
  hookToolCounter: number;

  // ── Tokenlar ──
  inputTokens: number;
  outputTokens: number;
  /** Sessiya modeli (transcript `message.model`дан). */
  model?: string;
  /** Shu model uchun kontekst oynasi (200k yoki 1M). */
  contextWindow: number;

  // ── Taymerlar (heuristik rejim) ──
  waitingTimer?: ReturnType<typeof setTimeout>;
  permissionTimer?: ReturnType<typeof setTimeout>;
}

export function createAgentState(
  id: number,
  filePath: string,
  folderName: string,
  opts: { role?: string; task?: string; isExternal?: boolean; sessionId?: string } = {},
): AgentState {
  return {
    id,
    filePath,
    sessionId: opts.sessionId,
    fileOffset: 0,
    lineBuffer: "",
    folderName,
    role: opts.role,
    task: opts.task,
    isExternal: opts.isExternal ?? false,
    hadToolsInTurn: false,
    isWaiting: true,
    activeToolIds: new Set(),
    subagentToolIds: new Set(),
    permissionActive: false,
    hookDelivered: false,
    hookToolQueue: new Map(),
    hookToolCounter: 0,
    inputTokens: 0,
    outputTokens: 0,
    contextWindow: MAX_CONTEXT_TOKENS,
  };
}
