// ── Server-tomon agent holati ────────────────────────────────
// Har bir kuzatilayotgan Claude Code sessiyasi = bitta AgentState.

import { MAX_CONTEXT_TOKENS } from "../core/constants.js";

export interface AgentState {
  /** Monoton o'suvchi butun ID (webview personaji shu bilan kalitlanadi). */
  id: number;
  /** Kuzatilayotgan .jsonl transcript fayl yo'li. */
  filePath: string;
  /** Faylda o'qilgan bayt (keyingi polling shu yerdan davom etadi). */
  fileOffset: number;
  /** Qism-qator buferi (bitta o'qishda yarim qator qolsa). */
  lineBuffer: string;
  /** UTF-8 dekoder — chunk chegarasidagi tugamagan ko'p-baytli belgini saqlaydi
   *  (64KB o'rtasida belgi buzilmasin). Offset qayta o'rnatilsa tozalanadi. */
  lineDecoder?: import("node:string_decoder").StringDecoder;
  /** Claude sessiya ID (hook eventlarini yo'naltirish uchun). */
  sessionId?: string;
  /** Loyiha papka nomi (ko'rsatish uchun). */
  folderName: string;
  /** Aniqlangan rol (research/frontend/...). Terminal faoliyatidan avtomatik. */
  role?: string;
  /** Rol ballari — tool faoliyatidan yig'iladi (roleInference). */
  roleScores: Record<string, number>;
  /** Boshlang'ich vazifa yorlig'i. */
  task?: string;
  /** VS Code terminali tomonidan yaratilganmi yoki tashqi sessiya. */
  isExternal: boolean;

  // ── Faoliyat holati ──
  /** Hozir navbatda tool ishlatilganmi (idle-heuristikasi uchun). */
  hadToolsInTurn: boolean;
  /** Agent kutish holatidami ("Done"/"Waiting"). */
  isWaiting: boolean;
  /** Faol tool ID'lari. */
  activeToolIds: Set<string>;
  /** Foydali toollar (sub-agent Task ID'lari). */
  subagentToolIds: Set<string>;
  /** Joriy tool yorlig'i/nomi + ruxsat holati — webview qayta yuklanganda
   *  holatni tiklash uchun saqlanadi. */
  currentToolLabel?: string;
  currentToolName?: string;
  permissionActive: boolean;
  /** Xato yuz berdi (tool is_error / api_error / PostToolUseFailure) va agent
   *  hali tiklanmagan — "Bloklangan" (qizil) ko'rsatiladi. Yangi navbat yoki
   *  muvaffaqiyatli tool bilan tozalanadi. */
  blocked: boolean;
  /** Sessiya ruxsat rejimi (transcript `permissionMode`): "default" |
   *  "auto" | "bypassPermissions". Faqat "default"da tool ruxsat so'raydi —
   *  boshqa rejimda heuristik permission-taymer ishlatilmaydi (false-positive
   *  bo'lmasin). Ko'pchilik sessiya bypass/auto (ruxsat so'ramaydi). */
  permissionMode: string;

  // ── Hook rejimi ──
  /** Bu agentga hook eventi kelgan — JSONL heuristikasi o'chiriladi. */
  hookDelivered: boolean;
  /** PreToolUse → PostToolUse mosligi. Hook payloadda tool_use_id YO'Q, shu
   *  sababli tool imzosi (name + input) bo'yicha moslaymiz. Imzo → FIFO tool
   *  ID'lari (bir xil imzoli parallel tool'lar uchun navbat). Parallel tool'lar
   *  endi to'g'ri yopiladi (biri ustiga biri yozib qo'ymaydi). */
  hookToolQueue: Map<string, string[]>;
  /** Hook tool ID hisoblagichi. */
  hookToolCounter: number;

  // ── Tokenlar ──
  inputTokens: number;
  outputTokens: number;
  /** Xarajat uchun JAMLANGAN billing tokenlari (kontekst hajmidan farqli). */
  billedInput: number;
  billedCacheWrite: number;
  billedCacheRead: number;
  /** Sessiya modeli (transcript `message.model`dan). */
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
    roleScores: {},
    task: opts.task,
    isExternal: opts.isExternal ?? false,
    hadToolsInTurn: false,
    isWaiting: true,
    activeToolIds: new Set(),
    subagentToolIds: new Set(),
    permissionActive: false,
    blocked: false,
    permissionMode: "default", // mode satri ko'rilguncha konservativ (heuristik yoqiq)
    hookDelivered: false,
    hookToolQueue: new Map(),
    hookToolCounter: 0,
    inputTokens: 0,
    outputTokens: 0,
    billedInput: 0,
    billedCacheWrite: 0,
    billedCacheRead: 0,
    contextWindow: MAX_CONTEXT_TOKENS,
  };
}
