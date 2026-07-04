import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { CLAUDE_TERMINAL_NAME_PREFIX, PROJECT_SCAN_INTERVAL_MS } from "../core/constants.js";
import { getSessionDir } from "../core/paths.js";
import type { AgentStateStore } from "../server/agentStateStore.js";
import type { FileWatcher } from "../server/fileWatcher.js";
import { extractFirstTask } from "../server/transcriptParser.js";
import { type AgentState, createAgentState } from "../server/types.js";

// ── Agent boshqaruvchisi ─────────────────────────────────────
// Ikki yo'l: (a) `+Agent` — yangi Claude terminali; (b) AVTO — shu loyihада
// ochilgan Claude sessiyasi (siz +Agent bosmasangiz ham topiladi). Ofis
// BO'SH boshlanadi: faqat ochilishдан keyingi YANGI faoliyat (mtime>=startup)
// yoki +Agent agent yaratadi. Eski sessiyalar tinch qoladi.

const HEAD_BYTES = 8192;

export class AgentManager {
  private terminals = new Map<number, vscode.Terminal>();
  private scanTimer?: ReturnType<typeof setInterval>;
  private disposables: vscode.Disposable[] = [];
  private terminalCounter = 0;
  private startupTime = 0;

  constructor(
    private store: AgentStateStore,
    private watcher: FileWatcher,
    private log: (m: string) => void = () => {},
  ) {}

  start(): void {
    // Terminal yopilса — unga bog'liq agent ham o'chadi (dispose emas — allaqachon yopilyapti)
    this.disposables.push(
      vscode.window.onDidCloseTerminal((term) => {
        for (const [id, t] of this.terminals) {
          if (t === term) {
            this.detach(id);
            break;
          }
        }
      }),
    );
    this.startupTime = Date.now();
    this.scanTimer = setInterval(() => this.scanForNew(), PROJECT_SCAN_INTERVAL_MS);
  }

  private workspaceFolders(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  }

  private folderNameOf(wsPath: string): string {
    return path.basename(wsPath);
  }

  private sessionDirs(): { dir: string; folderName: string }[] {
    return this.workspaceFolders().map((ws) => ({
      dir: getSessionDir(ws),
      folderName: this.folderNameOf(ws),
    }));
  }

  /** Shu loyihада YANGI faoliyatли sessiyani avto-qabul qiladi. */
  private scanForNew(): void {
    for (const { dir, folderName } of this.sessionDirs()) {
      for (const f of this.listJsonl(dir)) {
        const sid = path.basename(f.filePath, ".jsonl");
        // Dublikatдан himoya — fayl YOKI sessiya allaqachon kuzatilsa o'tkazamiz
        if (this.store.findByFile(f.filePath) || this.store.findBySession(sid)) continue;
        if (f.mtime < this.startupTime) continue; // ochilishдан oldingi — kutamiz
        this.adopt(f.filePath, folderName, true);
      }
    }
    // Fayli o'chirilган tashqi agentlarни tozalaymiz
    for (const agent of this.store.values()) {
      if (agent.isExternal && !fs.existsSync(agent.filePath)) {
        this.store.remove(agent.id);
      }
    }
  }

  private listJsonl(dir: string): { filePath: string; mtime: number }[] {
    const out: { filePath: string; mtime: number }[] = [];
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return out;
    }
    for (const name of entries) {
      if (!name.endsWith(".jsonl")) continue;
      const filePath = path.join(dir, name);
      try {
        const st = fs.statSync(filePath);
        if (st.isFile()) out.push({ filePath, mtime: st.mtimeMs });
      } catch {
        /* skip */
      }
    }
    return out;
  }

  private adopt(filePath: string, folderName: string, isExternal: boolean, role?: string): AgentState | null {
    const sessionId = path.basename(filePath, ".jsonl");
    if (this.store.findByFile(filePath) || this.store.findBySession(sessionId)) return null;
    const id = this.store.allocateId();
    const task = this.readFirstTask(filePath);
    const agent = createAgentState(id, filePath, folderName, { role, task, isExternal, sessionId });
    this.watcher.primeFromStart(agent);
    this.store.add(agent);
    // Avto-agentни aktiv Claude terminaliга bog'laymiz — terminal yopilса
    // agent ham o'chadi, "Terminal" tugmasi ham shu terminalни ochadi.
    if (isExternal) {
      const active = vscode.window.activeTerminal;
      if (active && active.name.startsWith(CLAUDE_TERMINAL_NAME_PREFIX)) {
        this.terminals.set(id, active);
      }
    }
    return agent;
  }

  private readFirstTask(filePath: string): string {
    try {
      const fd = fs.openSync(filePath, "r");
      const buf = Buffer.alloc(HEAD_BYTES);
      const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
      fs.closeSync(fd);
      return extractFirstTask(buf.toString("utf8", 0, n));
    } catch {
      return "Claude Code sessiya";
    }
  }

  /** Hook sessiyasi uchun agent topadi yoki yaratadi (avto-kashfiyot). */
  ensureSessionAgent(sessionId: string, cwd?: string): AgentState {
    const existing = this.store.findBySession(sessionId);
    if (existing) return existing;
    const base = cwd || this.workspaceFolders()[0] || os.homedir();
    const filePath = path.join(getSessionDir(base), `${sessionId}.jsonl`);
    const byFile = this.store.findByFile(filePath);
    if (byFile) {
      byFile.sessionId = sessionId;
      return byFile;
    }
    const agent = this.adopt(filePath, this.folderNameOf(base), true);
    if (agent) agent.sessionId = sessionId;
    return agent ?? this.store.findBySession(sessionId)!;
  }

  /** `+Agent` — yangi Claude Code terminali + agent (darhol ko'rinadi). */
  launchAgent(opts: { folderPath?: string; role?: string; bypassPermissions?: boolean } = {}): void {
    const cwd = opts.folderPath || this.workspaceFolders()[0] || os.homedir();
    const sessionId = crypto.randomUUID();
    const idx = ++this.terminalCounter;
    const terminal = vscode.window.createTerminal({ name: `${CLAUDE_TERMINAL_NAME_PREFIX} #${idx}`, cwd });
    terminal.show();
    const args = ["--session-id", sessionId];
    if (opts.bypassPermissions) args.push("--dangerously-skip-permissions");
    terminal.sendText(`claude ${args.join(" ")}`);

    const expectedFile = path.join(getSessionDir(cwd), `${sessionId}.jsonl`);
    const id = this.store.allocateId();
    const agent = createAgentState(id, expectedFile, this.folderNameOf(cwd), {
      role: opts.role,
      task: "Yangi sessiya",
      isExternal: false,
      sessionId,
    });
    this.watcher.primeFromStart(agent);
    this.store.add(agent);
    this.terminals.set(id, terminal);
    this.log(`+Agent #${id} terminal ochildi: claude --session-id ${sessionId.slice(0, 8)}…`);

    // 20s'да transcript paydo bo'lmasa — 'claude' PATH'да bo'lmasligi mumkin
    setTimeout(() => {
      if (this.store.has(id) && !fs.existsSync(expectedFile)) {
        this.log(`⚠ #${id}: 20s'да transcript topilmadi — 'claude' PATH'да o'rnatilganini tekshiring (terminalда xato bormi?).`);
      }
    }, 20_000);
  }

  /** Agentни store'дан olib tashlaydi (terminalни YOPMAYDI). */
  private detach(id: number): void {
    this.terminals.delete(id);
    this.store.remove(id);
  }

  /** Webview "Yopish" tugmasi — agentни VA uning terminalини yopadi. */
  closeAgent(id: number): void {
    const term = this.terminals.get(id);
    this.detach(id);
    if (term) {
      try {
        term.dispose();
      } catch {
        /* ignore */
      }
    }
  }

  removeBySession(sessionId: string): void {
    const a = this.store.findBySession(sessionId);
    if (a) this.detach(a.id);
  }

  focusAgent(id: number): void {
    const term = this.terminals.get(id);
    if (term) term.show();
  }

  dispose(): void {
    if (this.scanTimer) clearInterval(this.scanTimer);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
