import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";

// ── Lokal hook-server ────────────────────────────────────────
// Claude Code hook-skripti POST qiladigan kichik HTTP server (Node http —
// Fastify shart emas). 127.0.0.1'da tasodifiy portda, Bearer token bilan.
//
// KO'P-OYNA: har VS Code oynasi (yoki CLI) O'Z serverini ishga tushiradi va
// ~/.agent-office/servers/<pid>.json ga {port, token, pid, folders} yozadi (har
// oyna o'z fayli — kontensiyasiz). Hook-skript event cwd'siga qarab to'g'ri
// oynani tanlaydi (hookRouting). Eski o'rnatilган hooklar uchun bitta legacy
// ~/.agent-office/server.json ham yoziladi (last-writer-wins).

export interface HookServerHandle {
  port: number;
  token: string;
}

const MAX_BODY = 256 * 1024;

export class HookServer {
  private server?: http.Server;
  private token = crypto.randomBytes(24).toString("hex");
  private port = 0;

  /** `folders` — shu oyna kuzatayotgan ish-papkalar (yo'naltirish uchun). */
  constructor(
    private onEvent: (sessionId: string, raw: Record<string, unknown>) => void,
    private folders: () => string[] = () => [],
  ) {}

  async start(): Promise<HookServerHandle | null> {
    this.pruneDead(); // o'lik oynalarning yozuvlarini tozalaymiz
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => this.handle(req, res));
      server.on("error", () => resolve(null));
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        this.port = typeof addr === "object" && addr ? addr.port : 0;
        this.server = server;
        this.writeEntry();
        resolve({ port: this.port, token: this.token });
      });
    });
  }

  /** Ish-papkalar o'zgarganда (onDidChangeWorkspaceFolders) yozuvni yangilaydi. */
  refreshFolders(): void {
    if (this.server) this.writeEntry();
  }

  private isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === "EPERM";
    }
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Liveness probe — auth'siz (faqat "shu server tirikmi" degani).
    if (req.method === "GET" && req.url === "/api/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    if (req.method !== "POST" || !req.url || !req.url.startsWith("/api/hooks/")) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.headers["authorization"] !== `Bearer ${this.token}`) {
      res.writeHead(401);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > MAX_BODY) req.destroy();
    });
    req.on("end", () => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      try {
        const raw = JSON.parse(body) as Record<string, unknown>;
        const sessionId = raw.session_id;
        if (typeof sessionId === "string" && raw.hook_event_name) {
          this.onEvent(sessionId, raw);
        }
      } catch {
        /* buzuq payload — e'tiborsiz */
      }
    });
  }

  private aoDir(): string {
    return path.join(os.homedir(), ".agent-office");
  }
  private serversDir(): string {
    return path.join(this.aoDir(), "servers");
  }
  private ownFile(): string {
    return path.join(this.serversDir(), `${process.pid}.json`);
  }
  private serverJsonPath(): string {
    return path.join(this.aoDir(), "server.json"); // legacy (eski hooklar uchun)
  }

  private atomicWrite(file: string, content: string): void {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // ATOMIK: temp faylga yozib, so'ng rename — hook-skript hech qachon
      // yarim-yozilgan faylni o'qimaydi (event tushib qolmaydi).
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, content);
      fs.renameSync(tmp, file);
    } catch {
      /* yozib bo'lmasa — hooks ishlamaydi, lekin JSONL zaxira bor */
    }
  }

  private writeEntry(): void {
    const folders = this.folders().filter((f): f is string => typeof f === "string" && f.length > 0);
    this.atomicWrite(this.ownFile(), JSON.stringify({ port: this.port, pid: process.pid, token: this.token, folders }));
    // Legacy — bitta server.json (eski o'rnatilган hooklar shuni o'qiydi).
    this.atomicWrite(this.serverJsonPath(), JSON.stringify({ port: this.port, pid: process.pid, token: this.token }));
  }

  /** O'lik oynalarning servers/<pid>.json yozuvlarini olib tashlaydi. */
  private pruneDead(): void {
    let names: string[];
    try {
      names = fs.readdirSync(this.serversDir());
    } catch {
      return; // papka yo'q — hali server ishga tushmagan
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(this.serversDir(), name);
      try {
        const e = JSON.parse(fs.readFileSync(file, "utf8")) as { pid?: number };
        if (typeof e.pid === "number" && e.pid !== process.pid && !this.isAlive(e.pid)) {
          fs.rmSync(file, { force: true });
        }
      } catch {
        /* parse xatosi (boshqa oyna hozir yozayotган bo'lishi mumkin) — tegmaymiz */
      }
    }
  }

  stop(): void {
    try {
      this.server?.close();
    } catch {
      /* ignore */
    }
    // O'z yozuvimizni tozalaymiz.
    try {
      fs.rmSync(this.ownFile(), { force: true });
    } catch {
      /* ignore */
    }
    // Legacy server.json — faqat oxirgi yozgan BIZ bo'lsak (TOCTOU: boshqa oyna
    // ustidan yozgan bo'lsa uning tirik faylini o'chirmaymiz).
    try {
      const cur = JSON.parse(fs.readFileSync(this.serverJsonPath(), "utf8")) as { pid?: number };
      if (cur.pid === process.pid) fs.rmSync(this.serverJsonPath(), { force: true });
    } catch {
      /* ignore */
    }
  }
}
