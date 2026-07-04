import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { READING_TOOLS, SUBAGENT_TOOL_NAMES } from "../core/constants.js";
import type { ClientMessage, ServerMessage } from "../core/messages.js";
import { AgentStateStore } from "../server/agentStateStore.js";
import { FileWatcher } from "../server/fileWatcher.js";
import { handleHookEvent } from "../server/hookHandler.js";
import { HookServer } from "../server/hookServer.js";
import type { AgentState } from "../server/types.js";
import { AgentManager } from "./agentManager.js";
import { installHooks } from "./hookInstaller.js";

export const VIEW_ID = "agent-office.panelView";
const MAX_PENDING = 1000;

// ── Webview view provider ────────────────────────────────────
// Store hodisаларини webview'ga uzatadi. Webview React ilovаси
// tayyor bo'lguncha (webviewReady) xabarlar buferlanadi — aks holda
// dastlabki hodisalar yo'qoladi.

export class OfficeViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private store = new AgentStateStore();
  private watcher = new FileWatcher(this.store);
  private manager = new AgentManager(this.store, this.watcher, (m) => this.logMsg(m));
  private hookServer = new HookServer((sessionId, raw) => this.onHookEvent(sessionId, raw));
  private pending: ServerMessage[] = [];
  private ready = false;
  private soundEnabled = true;
  readonly log = vscode.window.createOutputChannel("Agent Office");

  private logMsg(m: string): void {
    const t = new Date().toISOString().slice(11, 19);
    this.log.appendLine(`[${t}] ${m}`);
  }

  constructor(private readonly extensionUri: vscode.Uri, private readonly version: string) {
    // Yangi agent → personaj yaratish
    this.store.on("agentAdded", (agent: AgentState) => {
      this.logMsg(`+ agent #${agent.id}  folder=${agent.folderName}  role=${agent.role ?? "-"}  session=${agent.sessionId?.slice(0, 8) ?? "-"}  external=${agent.isExternal}`);
      this.sendOrBuffer({
        type: "agentCreated",
        id: agent.id,
        folderName: agent.folderName,
        isExternal: agent.isExternal,
        role: agent.role,
        task: agent.task,
      });
    });
    this.store.on("agentRemoved", (id: number) => {
      this.logMsg(`- agent #${id} yopildi`);
      this.sendOrBuffer({ type: "agentClosed", id });
    });
    // Faoliyat xabarlari
    this.store.on("broadcast", (msg: ServerMessage) => {
      this.logBroadcast(msg);
      this.sendOrBuffer(msg);
    });
  }

  /** Muhim holat o'zgarishlarini logга yozadi (token spam'siz). */
  private logBroadcast(msg: ServerMessage): void {
    switch (msg.type) {
      case "agentStatus":
        this.logMsg(`  #${msg.id} → ${msg.status}${msg.awaitingInput ? " (kirish kutmoqda)" : ""}`);
        break;
      case "agentToolStart":
        this.logMsg(`  #${msg.id} tool: ${msg.status}`);
        break;
      case "agentToolPermission":
        this.logMsg(`  #${msg.id} 🔔 ruxsat so'raldi`);
        break;
      case "subagentToolStart":
        this.logMsg(`  #${msg.id} + sub-agent`);
        break;
    }
  }

  activate(): void {
    this.watcher.start();
    this.manager.start();
    this.logMsg(`Agent Office ${this.version} yoqildi. Ish papkalari: ${(vscode.workspace.workspaceFolders ?? []).map((f) => f.name).join(", ") || "(yo'q)"}`);

    // Hook rejimi (ishonchli aniqlash) — sozlamада yoqilған bo'lsa.
    const hooksEnabled = vscode.workspace
      .getConfiguration("agent-office")
      .get<boolean>("hooksEnabled", true);
    if (hooksEnabled) {
      void this.hookServer.start().then((handle) => {
        if (!handle) {
          this.logMsg("⚠ Hook server ishga tushmadi — faqat JSONL kuzatuvи ishlaydi.");
          return;
        }
        const hookScript = vscode.Uri.joinPath(this.extensionUri, "dist", "hooks", "claude-hook.js").fsPath;
        const ok = installHooks(hookScript);
        this.logMsg(`Hook server: 127.0.0.1:${handle.port} · ~/.claude/settings.json hook: ${ok ? "o'rnatildi ✓" : "o'rnatilmadi ✗"}`);
      });

      const autoSpawn = vscode.workspace.getConfiguration("agent-office").get<boolean>("autoSpawnAgent", false);
      if (autoSpawn && (vscode.workspace.workspaceFolders?.length ?? 0) > 0) {
        setTimeout(() => {
          if (this.store.size === 0) {
            this.logMsg("autoSpawnAgent: agent yo'q — bittasini ishga tushiramiz.");
            this.manager.launchAgent();
          }
        }, 2000);
      }
    } else {
      this.logMsg("Hook rejimi o'chirilган (agent-office.hooksEnabled=false) — faqat JSONL.");
    }
  }

  /** Hook eventини agentга yo'naltiradi. Shu loyiha sessiyasi bo'lsa
   *  agentни avto-yaratadi (+Agent shart emas). */
  private onHookEvent(sessionId: string, raw: Record<string, unknown>): void {
    const event = raw.hook_event_name as string;
    this.logMsg(`[hook] ${event}  session=${sessionId.slice(0, 8)}${raw.tool_name ? "  tool=" + raw.tool_name : ""}`);
    if (event === "SessionEnd") {
      this.manager.removeBySession(sessionId);
      return;
    }
    let agent = this.store.findBySession(sessionId);
    if (!agent) {
      const cwd = typeof raw.cwd === "string" ? raw.cwd : undefined;
      if (!cwd || !this.isInWorkspace(cwd)) {
        this.logMsg(`[hook] o'tkazildi — sessiya bu loyihада emas (cwd=${cwd ?? "?"})`);
        return;
      }
      agent = this.manager.ensureSessionAgent(sessionId, cwd);
    }
    handleHookEvent(this.store, agent, raw);
  }

  private isInWorkspace(cwd: string): boolean {
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const norm = (p: string) => p.replace(/[\\/]+$/, "").toLowerCase();
    const c = norm(cwd);
    return folders.some((f) => {
      const nf = norm(f);
      return c === nf || c.startsWith(nf + "/") || c.startsWith(nf + "\\");
    });
  }

  private sendOrBuffer(msg: ServerMessage): void {
    if (this.ready && this.view) {
      this.view.webview.postMessage(msg);
    } else {
      this.pending.push(msg);
      if (this.pending.length > MAX_PENDING) this.pending.shift();
    }
  }

  private post(msg: ServerMessage): void {
    this.view?.webview.postMessage(msg);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
    };
    view.webview.html = this.getWebviewContent(view.webview);

    view.webview.onDidReceiveMessage((msg: ClientMessage) => this.onMessage(msg));

    view.onDidDispose(() => {
      this.view = undefined;
      this.ready = false;
    });
  }

  private onMessage(msg: ClientMessage): void {
    switch (msg.type) {
      case "webviewReady":
        this.onWebviewReady();
        break;
      case "launchAgent":
        this.manager.launchAgent(msg);
        break;
      case "focusAgent":
        this.manager.focusAgent(msg.id);
        break;
      case "closeAgent":
        this.manager.closeAgent(msg.id);
        break;
      case "setSoundEnabled":
        this.soundEnabled = msg.enabled;
        break;
    }
  }

  /** Boot ketma-ketligi (tartib muhim). */
  private onWebviewReady(): void {
    this.ready = true;

    // 1) Provider imkoniyatlari
    this.post({
      type: "providerCapabilities",
      readingTools: [...READING_TOOLS],
      subagentToolNames: [...SUBAGENT_TOOL_NAMES],
    });
    // 2) Sozlamalar
    this.post({
      type: "settingsLoaded",
      soundEnabled: this.soundEnabled,
      extensionVersion: this.version,
    });
    // 3) Ish papkalari
    this.post({
      type: "workspaceFolders",
      folders: (vscode.workspace.workspaceFolders ?? []).map((f) => ({
        name: f.name,
        path: f.uri.fsPath,
      })),
    });
    // 4) Mavjud agentlar (buferdan oldin ular ham qayta yaratiladi)
    const agents = this.store.values();
    this.post({
      type: "existingAgents",
      agents: agents.map((a) => a.id),
      folderNames: Object.fromEntries(agents.map((a) => [a.id, a.folderName])),
      roles: Object.fromEntries(agents.filter((a) => a.role).map((a) => [a.id, a.role!])),
    });
    // 5) Har agentning JORIY holatини qayta yuboramiz (SNAPSHOT) — webview
    //    qayta yuklanганда ish 0dan boshlanmasin, aynan turган joyида davom etsin.
    for (const a of agents) {
      this.post({ type: "agentStatus", id: a.id, status: a.isWaiting ? "waiting" : "active" });
      if (a.inputTokens > 0 || a.outputTokens > 0) {
        this.post({ type: "agentTokenUsage", id: a.id, inputTokens: a.inputTokens, outputTokens: a.outputTokens });
      }
      if (!a.isWaiting && a.currentToolLabel) {
        this.post({ type: "agentToolStart", id: a.id, toolId: "restore", status: a.currentToolLabel, toolName: a.currentToolName });
      }
      for (const tid of a.subagentToolIds) {
        this.post({ type: "subagentToolStart", id: a.id, parentToolId: tid, toolId: tid, status: "Sub-agent" });
      }
      if (a.permissionActive) this.post({ type: "agentToolPermission", id: a.id });
    }
    // Snapshot joriy holatни to'liq tasvirlaydi — eski buferni tashlaymiz.
    this.pending = [];
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const indexPath = path.join(distPath.fsPath, "index.html");
    let html: string;
    try {
      html = fs.readFileSync(indexPath, "utf8");
    } catch {
      return `<html><body style="font-family:sans-serif;padding:20px;color:#ddd;background:#111">
        <h3>Agent Office</h3><p>Webview qurilmagan. <code>npm run build</code> ni ishga tushiring.</p></body></html>`;
    }
    // Nisbiy asset URL'larини webview URI'larига aylantiramiz
    html = html.replace(/(href|src)="\.?\/([^"]+)"/g, (_m, attr, file) => {
      const uri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, file));
      return `${attr}="${uri}"`;
    });
    // Runtime asset bazasi (GLB/tekstura three.js yuklashи uchun) — webview URI
    const baseUri = webview.asWebviewUri(distPath).toString().replace(/\/$/, "");
    html = html.replace(
      /<head>/i,
      `<head><script>window.__ASSET_BASE__ = ${JSON.stringify(baseUri + "/")};</script>`,
    );
    return html;
  }

  dispose(): void {
    this.watcher.stop();
    this.manager.dispose();
    this.hookServer.stop();
    this.store.disposeAll();
    this.log.dispose();
  }
}
