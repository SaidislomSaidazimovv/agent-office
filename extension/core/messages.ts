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
  | AgentRoleDetected
  | SubagentToolStart
  | SubagentToolDone
  | SubagentClear
  | AgentTokenUsage
  | WorkspaceFolders
  | GitStatus
  | SettingsLoaded
  | HookStatus
  | LayoutLoaded;

// ── Webview → extension ──────────────────────────────────────
export type ClientMessage =
  | WebviewReady
  | LaunchAgent
  | FocusAgent
  | CloseAgent
  | SetSoundEnabled
  | SaveLayout;

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
}
export interface AgentRoleDetected {
  type: "agentRoleDetected";
  id: number;
  /** Faoliyatdan aniqlangan rol (frontend/backend/qa/docs/data/research). */
  role: string;
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
  /** Papka nomi → git holati (branch + o'zgargan fayllar soni). */
  repos: { name: string; branch?: string; changed: number }[];
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
