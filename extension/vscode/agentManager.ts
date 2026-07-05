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
// Ikki yo'l: (a) `+Agent` — yangi Claude terminali; (b) AVTO — shu loyihada
// ochilgan Claude sessiyasi (siz +Agent bosmasangiz ham topiladi). Ofis
// BO'SH boshlanadi: faqat ochilishdan keyingi YANGI faoliyat (mtime>=startup)
// yoki +Agent agent yaratadi. Eski sessiyalar tinch qoladi.

const HEAD_BYTES = 8192;

export class AgentManager {
  private terminals = new Map<number, vscode.Terminal>();
  private scanTimer?: ReturnType<typeof setInterval>;
  private disposables: vscode.Disposable[] = [];
  private terminalCounter = 0;
  private startupTime = 0;
  /** /clear yoki /resume'dan keyin tashlab ketilgan eski transcript fayllari —
   *  scanForNew ularni qayta adopt qilmasin (aks holda zombi qayta paydo bo'ladi). */
  private retired = new Set<string>();

  constructor(
    private store: AgentStateStore,
    private watcher: FileWatcher,
    private log: (m: string) => void = () => {},
  ) {}

  start(): void {
    // Terminal yopilsa — unga bog'liq agent ham o'chadi (dispose emas — allaqachon yopilyapti)
    this.disposables.push(
      vscode.window.onDidCloseTerminal((term) => {
        for (const [id, t] of this.terminals) {
          if (t === term) {
            this.detach(id);
            return;
          }
        }
        // Bog'lanmagan tashqi agent shu terminalda bo'lgan bo'lsa — cwd bo'yicha tozala.
        const cwd = this.terminalCwd(term);
        if (!cwd) return;
        for (const a of this.store.values()) {
          if (a.isExternal && !this.terminals.has(a.id)) {
            const ws = this.wsForAgent(a);
            if (ws && this.samePath(cwd, ws)) {
              this.detach(a.id);
              return;
            }
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

  // ── Terminal ↔ agent bog'lash (cwd bo'yicha, ishonchli) ──────
  /** Terminalning ish papkasi — shell-integration yoki yaratilish opsiyasidan. */
  private terminalCwd(t: vscode.Terminal): string | undefined {
    const si = (t as { shellIntegration?: { cwd?: vscode.Uri } }).shellIntegration;
    if (si?.cwd) return si.cwd.fsPath;
    const c = (t.creationOptions as vscode.TerminalOptions | undefined)?.cwd;
    if (typeof c === "string") return c;
    if (c && typeof (c as vscode.Uri).fsPath === "string") return (c as vscode.Uri).fsPath;
    return undefined;
  }

  private samePath(a: string, b: string): boolean {
    const norm = (p: string) => path.resolve(p).replace(/[\\/]+$/, "");
    const na = norm(a);
    const nb = norm(b);
    return process.platform === "win32" ? na.toLowerCase() === nb.toLowerCase() : na === nb;
  }

  /** Agent qaysi ish papkasiga tegishli (sessiya papkasidan teskari topamiz). */
  private wsForAgent(agent: AgentState): string | undefined {
    const dir = path.dirname(agent.filePath);
    return this.workspaceFolders().find((ws) => this.samePath(getSessionDir(ws), dir));
  }

  /** Agentni cwd mos keladigan, band bo'lmagan terminalga bog'laydi. */
  private bindByCwd(agent: AgentState): boolean {
    if (this.terminals.has(agent.id)) return true;
    const ws = this.wsForAgent(agent);
    if (!ws) return false;
    const bound = new Set(this.terminals.values());
    const matches = (t: vscode.Terminal): boolean => {
      const cwd = this.terminalCwd(t);
      return !!cwd && this.samePath(cwd, ws);
    };
    const active = vscode.window.activeTerminal;
    if (active && !bound.has(active) && matches(active)) {
      this.terminals.set(agent.id, active);
      return true;
    }
    for (const t of vscode.window.terminals) {
      if (!bound.has(t) && matches(t)) {
        this.terminals.set(agent.id, t);
        return true;
      }
    }
    return false;
  }

  /** Shu loyihada YANGI faoliyatli sessiyani avto-qabul qiladi. */
  private scanForNew(): void {
    for (const { dir, folderName } of this.sessionDirs()) {
      const ws = this.wsForDir(dir);
      for (const f of this.listJsonl(dir)) {
        const sid = path.basename(f.filePath, ".jsonl");
        // Dublikatdan himoya — fayl YOKI sessiya allaqachon kuzatilsa o'tkazamiz
        if (this.store.findByFile(f.filePath) || this.store.findBySession(sid)) continue;
        // /clear|/resume'dan keyin tashlab ketilgan eski fayl — qayta adopt qilmaymiz
        if (this.retired.has(f.filePath)) continue;
        if (f.mtime < this.startupTime) continue; // ochilishdan oldingi — kutamiz
        // /clear yoki /resume detektsiyasi (hook yo'q bo'lsa) — dublikatsiz reassign
        if (this.tryReassignNewFile(dir, ws, f.filePath)) continue;
        this.adopt(f.filePath, folderName, true);
      }
    }
    // Bog'lanmagan tashqi agentlarni cwd bo'yicha kech-bog'lash (terminal
    // shell-integration cwd'ni keyinroq bergan yoki keyin faol bo'lgan bo'lishi mumkin).
    for (const agent of this.store.values()) {
      if (agent.isExternal && !this.terminals.has(agent.id)) this.bindByCwd(agent);
    }
    // Yopilgan terminalli agentlarni tozalash (onDidCloseTerminal o'tkazib yuborilsa).
    const open = new Set(vscode.window.terminals);
    for (const id of [...this.terminals.keys()]) {
      const t = this.terminals.get(id);
      if (t && !open.has(t)) this.detach(id);
    }
    // Fayli o'chirilgan tashqi agentlarni tozalaymiz
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
    this.watcher.emitSnapshot(agent);
    // Tashqi agentni terminalga bog'laymiz — terminal yopilsa agent ham o'chadi,
    // "Terminal" tugmasi ham shu terminalni ochadi.
    //  1) cwd (ish papkasi) mos keladigan terminal — eng ishonchli.
    //  2) bo'lmasa — hozir faol terminal (foydalanuvchi endigina 'claude'
    //     yozgan bo'lishi ehtimoli katta; nomi "Claude Code" bo'lishi shart emas).
    if (isExternal && !this.bindByCwd(agent)) {
      const active = vscode.window.activeTerminal;
      const bound = new Set(this.terminals.values());
      if (active && !bound.has(active)) {
        const cwd = this.terminalCwd(active);
        const ws = this.wsForAgent(agent);
        // cwd noma'lum (shell-integration yo'q) YOKI ws mos — bog'laymiz
        if (!cwd || (ws && this.samePath(cwd, ws))) this.terminals.set(id, active);
      }
    }
    return agent;
  }

  private readFirstTask(filePath: string): string {
    let fd: number | undefined;
    try {
      fd = fs.openSync(filePath, "r");
      const buf = Buffer.alloc(HEAD_BYTES);
      const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
      return extractFirstTask(buf.toString("utf8", 0, n));
    } catch {
      return "Claude Code sessiya";
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {
          /* ignore */
        }
      }
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
    this.watcher.emitSnapshot(agent);
    this.terminals.set(id, terminal);
    this.log(`+Agent #${id} terminal ochildi: claude --session-id ${sessionId.slice(0, 8)}…`);

    // 20s'da transcript paydo bo'lmasa — 'claude' PATH'da bo'lmasligi mumkin →
    // zombi agentni olib tashlaymiz (terminal xatosi ko'rinsin uchun terminal saqlanadi).
    setTimeout(() => this.checkLaunchStalled(id, expectedFile), 20_000);
  }

  /** +Agent'dan 20s o'tdi — transcript hali yo'q. 'claude' PATH'da yo'q yoki
   *  terminalda xato bo'lishi mumkin. Zombi agentni olib tashlaymiz (terminalni
   *  YOPMAYMIZ — foydalanuvchi xatoni ko'rsin). */
  private checkLaunchStalled(id: number, expectedFile: string): void {
    const agent = this.store.get(id);
    if (!agent) return;
    if (agent.filePath !== expectedFile) return; // boshqa faylga ko'chgan (/clear) — tegmaymiz
    if (fs.existsSync(expectedFile)) return; // transcript paydo bo'ldi — joyida
    if (agent.inputTokens > 0 || !agent.isWaiting) return; // faoliyat belgisi bor
    this.log(`⚠ #${id}: 20s'da transcript topilmadi — 'claude' PATH'da yo'q bo'lishi mumkin (terminaldagi xatoni ko'ring). Agent olib tashlandi.`);
    this.detach(id);
  }

  /** Agentni store'dan olib tashlaydi (terminalni YOPMAYDI). */
  private detach(id: number): void {
    this.terminals.delete(id);
    this.store.remove(id);
  }

  /** Webview "Yopish" tugmasi — agentni VA uning terminalini yopadi. */
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

  /** Agentni yangi sessiyaga qayta biriktiradi (/clear yoki /resume). Eski
   *  faylni "retired"ga qo'shadi — scanForNew uni qayta adopt qilmasin. */
  private rebindAgentToSession(a: AgentState, newSessionId: string, dir: string): void {
    if (a.filePath) this.retired.add(a.filePath);
    a.sessionId = newSessionId;
    a.filePath = path.join(dir, `${newSessionId}.jsonl`);
    this.retired.delete(a.filePath); // yangi fayl retired bo'lib qolmasin
    a.hookDelivered = false;
    a.isWaiting = true;
    a.activeToolIds.clear();
    a.subagentToolIds.clear();
    a.inputTokens = 0; // yangi sessiya — kontekst 0dan (birinchi xabar to'g'rilaydi)
    a.outputTokens = 0;
    this.watcher.primeFromStart(a);
    this.watcher.emitSnapshot(a);
  }

  /** Shu papkadagi, terminali HALI OCHIQ, boshqa fayldagi agentlar. */
  private openBoundAgentsInDir(dir: string, excludeFile?: string): AgentState[] {
    const open = new Set(vscode.window.terminals);
    return this.store.values().filter((a) => {
      if (!this.samePath(path.dirname(a.filePath), dir)) return false;
      if (excludeFile && a.filePath === excludeFile) return false;
      const t = this.terminals.get(a.id);
      return !!t && open.has(t);
    });
  }

  /** JSONL-rejim (hook yo'q): yangi transcript fayl paydo bo'ldi — bu shu
   *  papkadagi agentning /clear yoki /resume'i bo'lishi mumkin. Agar papkada
   *  bog'lanmagan ochiq terminal bo'lmasa (yangi sessiya uchun joy yo'q) —
   *  mavjud agentni yangi faylga qayta biriktiramiz (dublikatsiz). */
  private tryReassignNewFile(dir: string, ws: string | undefined, newFile: string): boolean {
    const candidates = this.openBoundAgentsInDir(dir, newFile);
    if (candidates.length === 0) return false;
    // Papkada bog'lanmagan ochiq terminal bormi? Bo'lsa — yangi fayl o'shaniki
    // (haqiqiy parallel sessiya) → reassign qilmaymiz.
    if (ws) {
      const bound = new Set(this.terminals.values());
      const freeTermInDir = vscode.window.terminals.some((t) => {
        const cwd = this.terminalCwd(t);
        return !!cwd && this.samePath(cwd, ws) && !bound.has(t);
      });
      if (freeTermInDir) return false;
    }
    const active = vscode.window.activeTerminal;
    const pick = candidates.find((a) => this.terminals.get(a.id) === active) ?? candidates[0];
    const newSid = path.basename(newFile, ".jsonl");
    this.rebindAgentToSession(pick, newSid, dir);
    this.log(`↻ #${pick.id} /clear|/resume aniqlandi (JSONL) → session=${newSid.slice(0, 8)}…`);
    return true;
  }

  /** Berilgan sessiya papkasiga mos ish papkasini topadi. */
  private wsForDir(dir: string): string | undefined {
    return this.workspaceFolders().find((ws) => this.samePath(getSessionDir(ws), dir));
  }

  /** `/clear` yoki `/resume` — o'sha loyihadagi terminal-agentini yangi
   *  sessiyaga qayta biriktiradi (dublikat yaratmaydi). Topsa — qayta
   *  biriktirilgan agentni, aks holda null. */
  reassignForClear(newSessionId: string, cwd: string): AgentState | null {
    const dir = getSessionDir(cwd);
    const candidates = this.openBoundAgentsInDir(dir).filter((a) => a.sessionId !== newSessionId);
    if (candidates.length === 0) return null;
    let a: AgentState | undefined;
    if (candidates.length === 1) {
      a = candidates[0];
    } else {
      // Ko'p nomzod — /clear fokuslangan terminalda bo'ladi, faol terminalga
      // bog'langanini tanlaymiz; mos kelmasa noto'g'ri biriktirmaymiz.
      const active = vscode.window.activeTerminal;
      a = candidates.find((x) => this.terminals.get(x.id) === active);
      if (!a) return null;
    }
    this.rebindAgentToSession(a, newSessionId, dir);
    this.log(`↻ #${a.id} qayta biriktirildi (/clear yoki /resume) → session=${newSessionId.slice(0, 8)}…`);
    return a;
  }

  focusAgent(id: number): void {
    // Bog'lanmagan bo'lsa — hozir cwd bo'yicha kech-bog'lashga urinamiz.
    if (!this.terminals.has(id)) {
      const a = this.store.values().find((x) => x.id === id);
      if (a) this.bindByCwd(a);
    }
    const term = this.terminals.get(id);
    if (term) term.show();
  }

  dispose(): void {
    if (this.scanTimer) clearInterval(this.scanTimer);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
