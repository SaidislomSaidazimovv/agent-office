// ── Xabar protokoli (webview ↔ extension) ────────────────────
// Pixel Agents'ning AsyncAPI protokolining 3D-clone uchun moslangan qismi.
// Pixel-sprite xabarlari (characterSpritesLoaded, floorTilesLoaded, ...) olib
// tashlandi — biz 3D GLB'larni webview ichida to'g'ridan-to'g'ri yuklaymiz.

// ── Extension → webview ──────────────────────────────────────
export type ServerMessage =
  | ProviderCapabilities
  | AgentCreated
  | AgentClosed
  | AgentSelected
  | ExistingAgents
  | AgentStatus
  | AgentToolStart
  | AgentToolDone
  | AgentToolsClear
  | AgentToolPermission
  | AgentToolPermissionClear
  | AgentBlocked
  | AgentStuck
  | AgentRenamed
  | AgentRoleDetected
  | AgentPermissionMode
  | SubagentToolStart
  | SubagentToolDone
  | SubagentClear
  | AgentTokenUsage
  | WorkspaceFolders
  | GitStatus
  | SettingsLoaded
  | HookStatus
  | HistoryLoaded
  | LayoutLoaded;

// ── Webview → extension ──────────────────────────────────────
export type ClientMessage =
  | WebviewReady
  | LaunchAgent
  | FocusAgent
  | CloseAgent
  | SetSoundEnabled
  | SaveLayout
  | SaveMedia
  | SaveText
  | RenameAgent
  | SetRole
  | SessionStats;

/** Agentga qo'lda nom berish (bir repoda bir nechta agent bo'lsa farqlash uchun).
 *  Bo'sh nom → papka nomiga qaytadi. */
export interface RenameAgent {
  type: "renameAgent";
  id: number;
  name: string;
}

/** Agent rolini QO'LDA tuzatish (avtomatik aniqlash noto'g'ri bo'lsa). Bo'sh
 *  role → avtomatik aniqlashga qaytadi. Sessiya bo'yicha diskda saqlanadi. */
export interface SetRole {
  type: "setRole";
  id: number;
  role: string;
}

/** Davriy sessiya statistikasi (webview → host) — tarixga yozish uchun. Har
 *  agentning JORIY absolyut jami; host delta hisoblab kunlik tarixga qo'shadi. */
export interface SessionStats {
  type: "sessionStats";
  stats: { id: number; project: string; cost: number; inTok: number; outTok: number; tools: number; ms: number }[];
}

/** Ofis surati/klipi — foydalanuvchi tanlagan joyga saqlanadi (saqlash oynasi orqali). */
export interface SaveMedia {
  type: "saveMedia";
  kind: "png" | "webm";
  /** base64 (data: prefiksisiz). */
  data: string;
}

/** Hisobot/hikoya matni (.md) — foydalanuvchi tanlagan joyga saqlanadi. */
export interface SaveText {
  type: "saveText";
  kind: "report" | "story";
  content: string;
}

export type AgentActivityStatus = "active" | "waiting";

export interface ProviderCapabilities {
  type: "providerCapabilities";
  readingTools: string[];
  subagentToolNames: string[];
}
export interface AgentCreated {
  type: "agentCreated";
  id: number;
  folderName?: string;
  isExternal?: boolean;
  /** Foydalanuvchi tanlagan rol (research/frontend/backend/qa/docs/data). */
  role?: string;
  /** Boshlang'ich vazifa yorlig'i (transcriptdan). */
  task?: string;
}
export interface AgentClosed {
  type: "agentClosed";
  id: number;
}
export interface AgentSelected {
  type: "agentSelected";
  id: number;
}
export interface ExistingAgents {
  type: "existingAgents";
  agents: number[];
  folderNames: Record<string, string>;
  roles: Record<string, string>;
  /** Tashqi (avto-topilgan) agent id'lari — webview qayta yuklanganda origin
   *  belgisi to'g'ri tiklansin (aks holda hammasi "ichki" ko'rinardi). */
  externals?: number[];
}
export interface AgentStatus {
  type: "agentStatus";
  id: number;
  status: AgentActivityStatus;
  awaitingInput?: boolean;
}
export interface AgentToolStart {
  type: "agentToolStart";
  id: number;
  toolId: string;
  status: string;
  toolName?: string;
  permissionActive?: boolean;
  runInBackground?: boolean;
}
export interface AgentToolDone {
  type: "agentToolDone";
  id: number;
  toolId: string;
}
export interface AgentToolsClear {
  type: "agentToolsClear";
  id: number;
}
export interface AgentToolPermission {
  type: "agentToolPermission";
  id: number;
}
export interface AgentToolPermissionClear {
  type: "agentToolPermissionClear";
  id: number;
}
export interface SubagentToolStart {
  type: "subagentToolStart";
  id: number;
  parentToolId: string;
  toolId: string;
  status: string;
  /** Task tool'ining `description` maydoni ("Find flaky tests"). Bo'lmasligi mumkin. */
  label?: string;
  /** Task tool'ining `subagent_type` maydoni ("code-reviewer"). Bo'lmasligi mumkin. */
  kind?: string;
}
export interface SubagentToolDone {
  type: "subagentToolDone";
  id: number;
  parentToolId: string;
  toolId: string;
}
export interface SubagentClear {
  type: "subagentClear";
  id: number;
  parentToolId: string;
}
export interface AgentBlocked {
  type: "agentBlocked";
  id: number;
  blocked: boolean;
  /** Xatoning HAQIQIY matni (qisqartirilgan). Bo'lmasligi mumkin. */
  reason?: string;
}
/** Agent nomi o'zgardi (qo'lda). Bo'sh nom → papka nomi ishlatiladi. */
export interface AgentRenamed {
  type: "agentRenamed";
  id: number;
  name: string;
}
/** Agent JUDA uzoq (STUCK_MS) ruxsat kutmoqda — e'tibordan chetda qolgan. */
export interface AgentStuck {
  type: "agentStuck";
  id: number;
  stuck: boolean;
}
export interface AgentRoleDetected {
  type: "agentRoleDetected";
  id: number;
  /** Faoliyatdan aniqlangan rol (frontend/backend/qa/docs/data/research). */
  role: string;
}
/** Sessiya ruxsat rejimi aniqlandi/o'zgardi. "bypassPermissions" =
 *  --dangerously-skip-permissions (XAVFSIZLIK signali: tool ruxsat so'ramaydi).
 *  "auto"/"default" ham bo'lishi mumkin. Faqat default'dan farqlisi yuboriladi. */
export interface AgentPermissionMode {
  type: "agentPermissionMode";
  id: number;
  mode: string;
}
export interface AgentTokenUsage {
  type: "agentTokenUsage";
  id: number;
  inputTokens: number;
  outputTokens: number;
  /** Shu sessiya modeli uchun kontekst oynasi (200k yoki 1M). */
  contextWindow: number;
  /** Xarajat baholagichi uchun — model + jamlangan billing tokenlari. */
  model?: string;
  billedInput?: number;
  billedCacheWrite?: number;
  billedCacheRead?: number;
}
export interface GitStatus {
  type: "gitStatus";
  /** Papka nomi → git holati. `changed` = staged+unstaged (orqaga moslik);
   *  staged/unstaged/ahead/behind — VS Code Git API mavjud bo'lganda. */
  repos: { name: string; branch?: string; changed: number; staged?: number; unstaged?: number; ahead?: number; behind?: number }[];
}
export interface WorkspaceFolders {
  type: "workspaceFolders";
  folders: { name: string; path: string }[];
}
export interface SettingsLoaded {
  type: "settingsLoaded";
  soundEnabled: boolean;
  extensionVersion: string;
}
export interface HookStatus {
  type: "hookStatus";
  /** Shu oynada jonli hook oqimi bormi (true) yoki faqat JSONL zaxira (false). */
  active: boolean;
}
/** Saqlangan tarix — ochilganda bir marta yuboriladi (kunlik/loyiha jamlanma
 *  + so'nggi sessiyalar arxivi). */
export interface HistDayStat { cost: number; inTok: number; outTok: number; tools: number; ms: number; }
export interface HistArchiveSession { name?: string; project: string; at: number; cost: number; inTok: number; outTok: number; tools: number; ms: number; }
export interface HistoryLoaded {
  type: "historyLoaded";
  days: { date: string; projects: Record<string, HistDayStat> }[];
  sessions: HistArchiveSession[];
}
export interface LayoutItem {
  id: string;
  type: string;
  x: number;
  z: number;
  ry: number;
}
export interface LayoutLoaded {
  type: "layoutLoaded";
  items: LayoutItem[];
  floorColor?: string | null;
  wallColor?: string | null;
  packs?: unknown[];
}

export interface WebviewReady {
  type: "webviewReady";
}
export interface LaunchAgent {
  type: "launchAgent";
  folderPath?: string;
  role?: string;
  bypassPermissions?: boolean;
}
export interface FocusAgent {
  type: "focusAgent";
  id: number;
}
export interface CloseAgent {
  type: "closeAgent";
  id: number;
}
export interface SetSoundEnabled {
  type: "setSoundEnabled";
  enabled: boolean;
}
export interface SaveLayout {
  type: "saveLayout";
  items: LayoutItem[];
  floorColor?: string | null;
  wallColor?: string | null;
  packs?: unknown[];
}
