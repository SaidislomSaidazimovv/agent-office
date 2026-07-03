import * as crypto from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { CLAUDE_TERMINAL_NAME_PREFIX } from "../core/constants.js";
import { getSessionDir } from "../core/paths.js";
import type { AgentStateStore } from "../server/agentStateStore.js";
import type { FileWatcher } from "../server/fileWatcher.js";
import { createAgentState } from "../server/types.js";

// ── Agent boshqaruvchisi (TERMINALGA bog'liq) ────────────────
// Agent FAQAT `+Agent` orqali yaratiladi (yangi Claude Code terminali).
// Avtomat/tashqi sessiyalar qabul QILINMAYDI — agent o'z-o'zидан paydo
// bo'lmaydi. Terminal yopilганда agent ham o'chadi. Fayl/hook shu agentга
// sessionId bo'yicha bog'lanadi.

export class AgentManager {
  private terminals = new Map<number, vscode.Terminal>();
  private disposables: vscode.Disposable[] = [];
  private terminalCounter = 0;

  constructor(
    private store: AgentStateStore,
    private watcher: FileWatcher,
  ) {}

  start(): void {
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
  }

  private workspaceFolders(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  }

  private folderNameOf(wsPath: string): string {
    return path.basename(wsPath);
  }

  /** `+Agent` — yangi Claude Code terminali + agent (darhol ko'rinadi). */
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

    const expectedFile = path.join(getSessionDir(cwd), `${sessionId}.jsonl`);
    const folderName = this.folderNameOf(cwd);

    // Personaj DARHOL yaratiladi (idle). FileWatcher bu agentning faylини har
    // 500ms tekshiradi — Claude yozganда faoliyat avtomat oqib keladi.
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
    this.terminals.delete(id);
    this.store.remove(id);
  }

  /** Sessiya tugaganда (SessionEnd hook) agentни o'chiradi. */
  removeBySession(sessionId: string): void {
    const a = this.store.findBySession(sessionId);
    if (a) this.closeAgent(a.id);
  }

  focusAgent(id: number): void {
    const term = this.terminals.get(id);
    if (term) term.show();
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
