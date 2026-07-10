// ── Xabar protokoli (extension/core/messages.ts bilan bir xil) ──
// Webview tomoni. Extension host bilan sinxron saqlang.

export type AgentActivityStatus = "active" | "waiting";

export type ServerMessage =
  | { type: "providerCapabilities"; readingTools: string[]; subagentToolNames: string[] }
  | { type: "agentCreated"; id: number; folderName?: string; isExternal?: boolean; role?: string; task?: string }
  | { type: "agentClosed"; id: number }
  | { type: "agentSelected"; id: number }
  | { type: "existingAgents"; agents: number[]; folderNames: Record<string, string>; roles: Record<string, string> }
  | { type: "agentStatus"; id: number; status: AgentActivityStatus; awaitingInput?: boolean }
  | { type: "agentToolStart"; id: number; toolId: string; status: string; toolName?: string; permissionActive?: boolean; runInBackground?: boolean }
  | { type: "agentToolDone"; id: number; toolId: string }
  | { type: "agentToolsClear"; id: number }
  | { type: "agentToolPermission"; id: number }
  | { type: "agentToolPermissionClear"; id: number }
  | { type: "agentBlocked"; id: number; blocked: boolean }
  | { type: "subagentToolStart"; id: number; parentToolId: string; toolId: string; status: string }
  | { type: "subagentToolDone"; id: number; parentToolId: string; toolId: string }
  | { type: "subagentClear"; id: number; parentToolId: string }
  | { type: "agentTokenUsage"; id: number; inputTokens: number; outputTokens: number; contextWindow?: number; model?: string; billedInput?: number; billedCacheWrite?: number; billedCacheRead?: number }
  | { type: "gitStatus"; repos: { name: string; branch?: string; changed: number }[] }
  | { type: "workspaceFolders"; folders: { name: string; path: string }[] }
  | { type: "settingsLoaded"; soundEnabled: boolean; extensionVersion: string }
  | { type: "hookStatus"; active: boolean }
  | { type: "layoutLoaded"; items: LayoutItem[]; floorColor?: string | null; wallColor?: string | null; packs?: unknown[] };

export interface LayoutItem {
  id: string;
  type: string;
  x: number;
  z: number;
  ry: number;
}

export type ClientMessage =
  | { type: "webviewReady" }
  | { type: "launchAgent"; folderPath?: string; role?: string; bypassPermissions?: boolean }
  | { type: "focusAgent"; id: number }
  | { type: "closeAgent"; id: number }
  | { type: "setSoundEnabled"; enabled: boolean }
  | { type: "saveLayout"; items: LayoutItem[]; floorColor?: string | null; wallColor?: string | null; packs?: unknown[] };
