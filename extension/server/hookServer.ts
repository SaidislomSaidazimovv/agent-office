import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";

// ── Lokal hook-server ────────────────────────────────────────
// Claude Code hook-skripti POST qiladigan kichik HTTP server (Node http —
// Fastify shart emas). 127.0.0.1'да tasodifiy portда, Bearer token bilan.
// Kashfiyot: ~/.agent-office/server.json {port, pid, token}.

export interface HookServerHandle {
  port: number;
  token: string;
}

const MAX_BODY = 256 * 1024;

export class HookServer {
  private server?: http.Server;
  private token = crypto.randomBytes(24).toString("hex");

  constructor(private onEvent: (sessionId: string, raw: Record<string, unknown>) => void) {}

  start(): Promise<HookServerHandle | null> {
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => this.handle(req, res));
      server.on("error", () => resolve(null));
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        this.server = server;
        this.writeServerJson(port);
        resolve({ port, token: this.token });
      });
    });
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
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

  private serverJsonPath(): string {
    return path.join(os.homedir(), ".agent-office", "server.json");
  }

  private writeServerJson(port: number): void {
    try {
      fs.mkdirSync(path.dirname(this.serverJsonPath()), { recursive: true });
      fs.writeFileSync(
        this.serverJsonPath(),
        JSON.stringify({ port, pid: process.pid, token: this.token }),
      );
    } catch {
      /* yozib bo'lmasa — hooks ishlamaydi, lekin JSONL zaxira bor */
    }
  }

  stop(): void {
    try {
      this.server?.close();
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(this.serverJsonPath(), { force: true });
    } catch {
      /* ignore */
    }
  }
}
