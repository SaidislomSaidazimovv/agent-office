// ── Server-tomon agent holati ────────────────────────────────
// Har bir kuzatilayotgan Claude Code sessiyasi = bitta AgentState.

export interface AgentState {
  /** Monoton o'suvchi butun ID (webview personajи shu bilan kalitlanadi). */
  id: number;
  /** Kuzatilayotgan .jsonl transcript fayl yo'li. */
  filePath: string;
  /** Faylда o'qilgan bayt (keyingi polling shu yerdan davom etadi). */
  fileOffset: number;
  /** Qism-qator buferi (bitta o'qishда yarim qator qolsa). */
  lineBuffer: string;
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

  // ── Tokenlar ──
  inputTokens: number;
  outputTokens: number;

  // ── Taymerlar (heuristik rejim) ──
  waitingTimer?: ReturnType<typeof setTimeout>;
  permissionTimer?: ReturnType<typeof setTimeout>;
}

export function createAgentState(
  id: number,
  filePath: string,
  folderName: string,
  opts: { role?: string; task?: string; isExternal?: boolean } = {},
): AgentState {
  return {
    id,
    filePath,
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
    inputTokens: 0,
    outputTokens: 0,
  };
}
