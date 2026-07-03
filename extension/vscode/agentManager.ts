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
// JSONL sessiyalarини kashf qiladi (mavjud + yangi) va `+Agent`
// tugmаси uchun Claude Code terminalини ochadi.

// Faqat oxirgi 2 daqiqада o'zgargan tashqi sessiyaларни qabul qilamiz.
const EXTERNAL_ACTIVE_THRESHOLD_MS = 120_000;
const HEAD_BYTES = 8192; // birinchi vazifани o'qish uchun

export class AgentManager {
  private terminals = new Map<number, vscode.Terminal>();
  private knownFiles = new Set<string>();
  private scanTimer?: ReturnType<typeof setInterval>;
  private disposables: vscode.Disposable[] = [];
  private terminalCounter = 0;

  constructor(
    private store: AgentStateStore,
    private watcher: FileWatcher,
  ) {}

  start(): void {
    // Terminal yopilганда — mos agentни o'chiramiz
    this.disposables.push(
      vscode.window.onDidCloseTerminal((term) => {
        for (const [id, t] of this.terminals) {
          if (t === term) {
            this.closeAgent(id);
            break;
          }
        }
      }),
    );

    this.scanExisting();
    this.scanTimer = setInterval(() => this.scanForNew(), PROJECT_SCAN_INTERVAL_MS);
  }

  /** Ish papkalari ro'yxati. */
  private workspaceFolders(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  }

  private folderNameOf(wsPath: string): string {
    return path.basename(wsPath);
  }

  /** Barcha ish papkalari uchun sessiya papkаларини qaytaradi. */
  private sessionDirs(): { dir: string; folderName: string }[] {
    return this.workspaceFolders().map((ws) => ({
      dir: getSessionDir(ws),
      folderName: this.folderNameOf(ws),
    }));
  }

  /** Ishga tushishда: mavjud faol sessiyaларни qabul qilamiz. */
  private scanExisting(): void {
    for (const { dir, folderName } of this.sessionDirs()) {
      const files = this.listJsonl(dir);
      const now = Date.now();
      for (const f of files) {
        if (now - f.mtime <= EXTERNAL_ACTIVE_THRESHOLD_MS) {
          this.adopt(f.filePath, folderName, true);
        }
      }
    }
  }

  /** Har soniyada: kuzatilmayotgan yangi .jsonl fayllarни qabul qilamiz. */
  private scanForNew(): void {
    for (const { dir, folderName } of this.sessionDirs()) {
      for (const f of this.listJsonl(dir)) {
        if (this.knownFiles.has(f.filePath)) continue;
        const now = Date.now();
        if (now - f.mtime <= EXTERNAL_ACTIVE_THRESHOLD_MS) {
          this.adopt(f.filePath, folderName, true);
        }
      }
    }
    // O'chirilgan fayllar uchun TASHQI agentларni tozalaymiz.
    // (+Agent bilan ochilgan agentlar fayli hali paydo bo'lmagan bo'lishi
    //  mumkin — ular terminal yopilганда tozalanadi, bu yerда emas.)
    for (const agent of this.store.values()) {
      if (agent.isExternal && !fs.existsSync(agent.filePath)) {
        this.store.remove(agent.id);
        this.knownFiles.delete(agent.filePath);
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

  /** Faylни yangi agent sifatida kuzatuvга qo'shadi. */
  private adopt(
    filePath: string,
    folderName: string,
    isExternal: boolean,
    role?: string,
  ): number | null {
    if (this.store.findByFile(filePath)) return null;
    this.knownFiles.add(filePath);
    const id = this.store.allocateId();
    const task = this.readFirstTask(filePath);
    const sessionId = path.basename(filePath, ".jsonl");
    const agent = createAgentState(id, filePath, folderName, { role, task, isExternal, sessionId });
    this.watcher.primeFromStart(agent);
    this.store.add(agent);
    return id;
  }

  /** Hook sessiyasi uchun agent topadi yoki yaratadi (hook-asosli kashfiyot). */
  ensureSessionAgent(sessionId: string, cwd?: string): AgentState {
    const existing = this.store.findBySession(sessionId);
    if (existing) return existing;
    const base = cwd || this.workspaceFolders()[0] || os.homedir();
    const filePath = path.join(getSessionDir(base), `${sessionId}.jsonl`);
    const existingByFile = this.store.findByFile(filePath);
    if (existingByFile) {
      existingByFile.sessionId = sessionId;
      return existingByFile;
    }
    this.knownFiles.add(filePath);
    const id = this.store.allocateId();
    const agent = createAgentState(id, filePath, this.folderNameOf(base), {
      isExternal: true,
      sessionId,
      task: "Claude Code sessiya",
    });
    this.watcher.primeFromStart(agent);
    this.store.add(agent);
    return agent;
  }

  removeBySession(sessionId: string): void {
    const a = this.store.findBySession(sessionId);
    if (a) this.closeAgent(a.id);
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

  /** `+Agent` — yangi Claude Code terminalини ochadi. */
  launchAgent(opts: { folderPath?: string; role?: string; bypassPermissions?: boolean } = {}): void {
    const cwd = opts.folderPath || this.workspaceFolders()[0] || os.homedir();
    const sessionId = crypto.randomUUID();
    const idx = ++this.terminalCounter;
    const terminal = vscode.window.createTerminal({
      name: `${CLAUDE_TERMINAL_NAME_PREFIX} #${idx}`,
      cwd,
    });
    terminal.show();
    const args = ["--session-id", sessionId];
    if (opts.bypassPermissions) args.push("--dangerously-skip-permissions");
    terminal.sendText(`claude ${args.join(" ")}`);

    // Kutilgan JSONL fayl yo'li.
    const dir = getSessionDir(cwd);
    const expectedFile = path.join(dir, `${sessionId}.jsonl`);
    const folderName = this.folderNameOf(cwd);

    // Personajни DARHOL yaratamiz (idle) — Pixel Agents kabi. FileWatcher
    // barcha agent fayllarини har 500ms tekshiradi, shuning uchun Claude faylни
    // yozganда faoliyat avtomat oqib keladi (alohida polling shart emas).
    if (this.store.findByFile(expectedFile)) return;
    this.knownFiles.add(expectedFile);
    const id = this.store.allocateId();
    const agent = createAgentState(id, expectedFile, folderName, {
      role: opts.role,
      task: "Yangi sessiya",
      isExternal: false,
      sessionId,
    });
    this.watcher.primeFromStart(agent);
    this.store.add(agent);
    this.terminals.set(id, terminal);
  }

  closeAgent(id: number): void {
    const agent = this.store.get(id);
    if (agent) this.knownFiles.delete(agent.filePath);
    this.terminals.delete(id);
    this.store.remove(id);
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
