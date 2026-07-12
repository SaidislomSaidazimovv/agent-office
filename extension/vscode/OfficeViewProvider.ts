import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { newlyStuck, STUCK_MS } from "../core/attention.js";
import { READING_TOOLS, SUBAGENT_TOOL_NAMES } from "../core/constants.js";
import type { ClientMessage, ServerMessage } from "../core/messages.js";
import { OfficeStatusBar } from "./statusBar.js";
import { AgentStateStore } from "../server/agentStateStore.js";
import { FileWatcher } from "../server/fileWatcher.js";
import { gitInfoForPath } from "./gitInfo.js";
import { handleHookEvent } from "../server/hookHandler.js";
import { agentSnapshotMessages } from "../server/stateActions.js";
import { HookServer } from "../server/hookServer.js";
import type { AgentState } from "../server/types.js";
import { AgentManager } from "./agentManager.js";
import { installHooks } from "./hookInstaller.js";

export const VIEW_ID = "agent-office.panelView";
const MAX_PENDING = 1000;

// ── Webview view provider ────────────────────────────────────
// Store hodisalarini webview'ga uzatadi. Webview React ilovasi
// tayyor bo'lguncha (webviewReady) xabarlar buferlanadi — aks holda
// dastlabki hodisalar yo'qoladi.

export class OfficeViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private store = new AgentStateStore();
  private watcher = new FileWatcher(this.store);
  private manager = new AgentManager(this.store, this.watcher, (m) => this.logMsg(m));
  private hookServer = new HookServer((sessionId, raw) => this.onHookEvent(sessionId, raw));
  private hookActive = false;
  private autoSpawnTimer?: ReturnType<typeof setTimeout>;
  private pending: ServerMessage[] = [];
  private ready = false;
  private soundEnabled = true;
  private statusBar = new OfficeStatusBar();
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
      this.maybeNotify(msg);
      this.trackAttention(msg);
      this.refreshStatusBar();
    });
    this.store.on("agentAdded", () => this.refreshStatusBar());
    this.store.on("agentRemoved", (id: number) => {
      this.waitingSince.delete(id);
      this.stuck.delete(id);
      this.refreshStatusBar();
    });
    // "Tiqilib qolgan" tekshiruvi — arzon (30s'da bir marta, faqat sanoq).
    this.stuckTimer = setInterval(() => this.checkStuck(), 30_000);
  }

  // ── E'tibor: kim, qachondan beri kutmoqda ──
  // Ruxsat holati bir necha joyda o'rnatiladi (transcript taymeri, hook), shuning
  // uchun uni BITTA joyda — broadcast oqimida kuzatamiz (parser kodiga tegmaymiz).
  private waitingSince = new Map<number, number>();
  private stuck = new Set<number>();
  private stuckTimer?: ReturnType<typeof setInterval>;

  private trackAttention(msg: ServerMessage): void {
    if (msg.type === "agentToolPermission") {
      if (!this.waitingSince.has(msg.id)) this.waitingSince.set(msg.id, Date.now());
      return;
    }
    // Ruxsat tozalandi / yangi navbat boshlandi → kutish tugadi
    const cleared =
      msg.type === "agentToolPermissionClear" ||
      msg.type === "agentToolsClear" ||
      (msg.type === "agentStatus" && msg.status === "active");
    if (!cleared) return;
    const id = (msg as { id: number }).id;
    this.waitingSince.delete(id);
    if (this.stuck.delete(id)) this.sendOrBuffer({ type: "agentStuck", id, stuck: false });
  }

  private checkStuck(): void {
    const now = Date.now();
    for (const id of newlyStuck(this.waitingSince, this.stuck, now)) {
      const a = this.store.get(id);
      if (!a?.permissionActive) { this.waitingSince.delete(id); continue; } // holat o'zgargan
      this.stuck.add(id);
      this.sendOrBuffer({ type: "agentStuck", id, stuck: true });
      this.logMsg(`  #${id} ${Math.round(STUCK_MS / 60000)} daqiqadan beri ruxsat kutmoqda`);
      // Eskalatsiya — panel ochiq bo'lsa ham (3 daqiqa e'tiborsiz qolgan).
      if (vscode.workspace.getConfiguration("agent-office").get<boolean>("notifications", true)) {
        void vscode.window
          .showWarningMessage(`Agent Office — ${a.folderName}: ${Math.round(STUCK_MS / 60000)} daqiqadan beri ruxsat kutmoqda 🙋`, "Ko'rsatish")
          .then((pick) => { if (pick === "Ko'rsatish") this.manager.focusAgent(id); });
      }
    }
    this.refreshStatusBar();
  }

  private refreshStatusBar(): void {
    this.statusBar.update(
      this.store.values().map((a) => ({
        id: a.id,
        folderName: a.folderName,
        permissionActive: a.permissionActive,
        blocked: a.blocked,
        stuck: this.stuck.has(a.id),
      })),
    );
  }

  /** Ruxsat/blok holatlarida VS Code toast bildirishnomasi (sozlanadi,
   *  agent bo'yicha throttle — spam bo'lmasin). "Ko'rsatish" tugmasi
   *  agent terminaliga o'tkazadi. */
  private lastNotify = new Map<number, number>();
  private maybeNotify(msg: ServerMessage): void {
    let id: number, text: string;
    if (msg.type === "agentToolPermission") {
      id = msg.id;
      text = "ruxsat so'radi 🔔";
    } else if (msg.type === "agentBlocked" && msg.blocked) {
      id = msg.id;
      text = "bloklandi (xato) ⛔";
    } else {
      return;
    }
    const enabled = vscode.workspace.getConfiguration("agent-office").get<boolean>("notifications", true);
    if (!enabled) return;
    // Panel ko'rinib turgan bo'lsa — toast shart emas (ofisda ko'rinadi).
    if (this.view?.visible) return;
    const now = Date.now();
    const prev = this.lastNotify.get(id) ?? 0;
    if (now - prev < 4000) return; // throttle
    this.lastNotify.set(id, now);
    const name = this.store.get(id)?.folderName ?? `Agent #${id}`;
    void vscode.window.showWarningMessage(`Agent Office — ${name}: ${text}`, "Ko'rsatish").then((pick) => {
      if (pick === "Ko'rsatish") this.manager.focusAgent(id);
    });
  }

  /** Muhim holat o'zgarishlarini logga yozadi (token spam'siz). */
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

    // Hook rejimi (ishonchli aniqlash) — sozlamada yoqilg’an bo'lsa.
    const hooksEnabled = vscode.workspace
      .getConfiguration("agent-office")
      .get<boolean>("hooksEnabled", true);
    if (hooksEnabled) {
      void this.hookServer.start().then((handle) => {
        if (!handle) {
          this.logMsg("⚠ Hook server ishga tushmadi (boshqa oyna egallagan) — shu oynada faqat JSONL kuzatuvi.");
          this.setHookActive(false);
          return;
        }
        const hookScript = vscode.Uri.joinPath(this.extensionUri, "dist", "hooks", "claude-hook.js").fsPath;
        const ok = installHooks(hookScript);
        this.logMsg(`Hook server: 127.0.0.1:${handle.port} · ~/.claude/settings.json hook: ${ok ? "o'rnatildi ✓" : "o'rnatilmadi ✗"}`);
        this.setHookActive(true);
      });

      const autoSpawn = vscode.workspace.getConfiguration("agent-office").get<boolean>("autoSpawnAgent", false);
      if (autoSpawn && (vscode.workspace.workspaceFolders?.length ?? 0) > 0) {
        this.autoSpawnTimer = setTimeout(() => {
          this.autoSpawnTimer = undefined;
          if (this.store.size === 0) {
            this.logMsg("autoSpawnAgent: agent yo'q — bittasini ishga tushiramiz.");
            this.manager.launchAgent();
          }
        }, 2000);
      }
    } else {
      this.logMsg("Hook rejimi o'chirilgan (agent-office.hooksEnabled=false) — faqat JSONL.");
      this.setHookActive(false);
    }
  }

  /** Hook holatini saqlab webview'ga yuboradi (ko'rsatkich uchun). */
  private setHookActive(active: boolean): void {
    this.hookActive = active;
    this.sendOrBuffer({ type: "hookStatus", active });
  }

  /** Hook eventini agentga yo'naltiradi. Shu loyiha sessiyasi bo'lsa
   *  agentni avto-yaratadi (+Agent shart emas). */
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
        this.logMsg(`[hook] o'tkazildi — sessiya bu loyihada emas (cwd=${cwd ?? "?"})`);
        return;
      }
      // Yangi sessiya boshlandi — bu /clear yoki /resume bo'lishi mumkin:
      // o'sha terminalning mavjud agentini qayta biriktiramiz (dublikatsiz).
      if (event === "SessionStart") {
        const re = this.manager.reassignForClear(sessionId, cwd);
        if (re) {
          handleHookEvent(this.store, re, raw);
          return;
        }
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
      case "saveLayout":
        this.saveLayout(msg.items, msg.floorColor ?? null, msg.wallColor ?? null, msg.packs ?? []);
        break;
      case "saveMedia":
        void this.saveMedia(msg.kind, msg.data);
        break;
    }
  }

  /** Ofis surati/klipi — FOYDALANUVCHI tanlagan joyga (saqlash oynasi). Sukut
   *  bo'yicha hech qayerga yozilmaydi va hech qayerga yuborilmaydi. */
  private async saveMedia(kind: "png" | "webm", data: string): Promise<void> {
    // Faqat base64 belgilariga ruxsat — buzuq/xavfli kirish yozilmasin.
    if (typeof data !== "string" || !/^[A-Za-z0-9+/=]+$/.test(data) || data.length > 80_000_000) return;
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const name = `agent-office-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${kind}`;
    const dir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(dir, name)),
      filters: kind === "png" ? { Image: ["png"] } : { Video: ["webm"] },
    });
    if (!uri) return; // foydalanuvchi bekor qildi
    try {
      fs.writeFileSync(uri.fsPath, Buffer.from(data, "base64"));
      vscode.window.showInformationMessage(`Agent Office: ${path.basename(uri.fsPath)}`);
    } catch (e) {
      vscode.window.showErrorMessage(`Agent Office: ${(e as Error).message}`);
    }
  }

  // ── Git xabardorligi (branch + o'zgargan fayllar; child_process YO'Q) ──
  private gitTimer?: ReturnType<typeof setInterval>;
  private sendGitInfo(): void {
    const repos: { name: string; branch?: string; changed: number }[] = [];
    for (const f of vscode.workspace.workspaceFolders ?? []) {
      const g = gitInfoForPath(f.uri.fsPath);
      if (g) repos.push({ name: f.name, branch: g.branch, changed: g.changed });
    }
    this.post({ type: "gitStatus", repos });
  }
  /** Git holatini vaqti-vaqti bilan yangilaydi (VS Code Git API o'zgarishlarini
   *  aniq kuzatish o'rniga oddiy taymer — arzon, ishonchli). */
  private startGitRefresh(): void {
    if (this.gitTimer) return;
    this.gitTimer = setInterval(() => this.sendGitInfo(), 5000);
  }

  private layoutPath(): string {
    return path.join(os.homedir(), ".agent-office", "layout.json");
  }

  /** Foydalanuvchi ofis layout'ini atomik saqlaydi. */
  private saveLayout(items: unknown[], floorColor: string | null, wallColor: string | null, packs: unknown[]): void {
    try {
      const p = this.layoutPath();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const tmp = `${p}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ items, floorColor, wallColor, packs }));
      fs.renameSync(tmp, p);
    } catch {
      /* saqlab bo'lmasa — jim (layout ixtiyoriy) */
    }
  }

  private loadLayout(): { items: unknown[]; floorColor: string | null; wallColor: string | null; packs: unknown[] } {
    try {
      const o = JSON.parse(fs.readFileSync(this.layoutPath(), "utf8"));
      return {
        items: Array.isArray(o?.items) ? o.items : [],
        floorColor: typeof o?.floorColor === "string" ? o.floorColor : null,
        wallColor: typeof o?.wallColor === "string" ? o.wallColor : null,
        packs: Array.isArray(o?.packs) ? o.packs : [],
      };
    } catch {
      return { items: [], floorColor: null, wallColor: null, packs: [] };
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
    // 2b) Saqlangan ofis layout'i
    {
      const lay = this.loadLayout();
      this.post({ type: "layoutLoaded", items: lay.items as never, floorColor: lay.floorColor, wallColor: lay.wallColor, packs: lay.packs });
    }
    // 3) Ish papkalari
    this.post({
      type: "workspaceFolders",
      folders: (vscode.workspace.workspaceFolders ?? []).map((f) => ({
        name: f.name,
        path: f.uri.fsPath,
      })),
    });
    // 3b) Git holati (branch + o'zgargan fayllar) — child_process'siz
    this.sendGitInfo();
    this.startGitRefresh();
    // 4) Mavjud agentlar (buferdan oldin ular ham qayta yaratiladi)
    const agents = this.store.values();
    this.post({
      type: "existingAgents",
      agents: agents.map((a) => a.id),
      folderNames: Object.fromEntries(agents.map((a) => [a.id, a.folderName])),
      roles: Object.fromEntries(agents.filter((a) => a.role).map((a) => [a.id, a.role!])),
    });
    // 5) Har agentning JORIY holatini qayta yuboramiz (SNAPSHOT) — webview
    //    qayta yuklanganda ish 0dan boshlanmasin, aynan turgan joyida davom etsin.
    this.post({ type: "hookStatus", active: this.hookActive });
    for (const a of agents) {
      for (const msg of agentSnapshotMessages(a)) this.post(msg);
    }
    // "Tiqilib qolgan" — provider darajasidagi holat (AgentState'da emas), shuning
    // uchun snapshot'dan keyin alohida qayta yuboriladi.
    for (const id of this.stuck) this.post({ type: "agentStuck", id, stuck: true });
    // Snapshot joriy holatni to'liq tasvirlaydi — eski buferni tashlaymiz.
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
    // Nisbiy asset URL'larini webview URI'lariga aylantiramiz
    html = html.replace(/(href|src)="\.?\/([^"]+)"/g, (_m, attr, file) => {
      const uri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, file));
      return `${attr}="${uri}"`;
    });
    // Runtime asset bazasi (GLB/tekstura three.js yuklashi uchun) — webview URI
    const baseUri = webview.asWebviewUri(distPath).toString().replace(/\/$/, "");
    html = html.replace(
      /<head>/i,
      `<head><script>window.__ASSET_BASE__ = ${JSON.stringify(baseUri + "/")};</script>`,
    );
    return html;
  }

  dispose(): void {
    if (this.autoSpawnTimer) clearTimeout(this.autoSpawnTimer);
    if (this.gitTimer) clearInterval(this.gitTimer);
    if (this.stuckTimer) clearInterval(this.stuckTimer);
    this.statusBar.dispose();
    this.watcher.stop();
    this.manager.dispose();
    this.hookServer.stop();
    this.store.disposeAll();
    this.log.dispose();
  }
}
