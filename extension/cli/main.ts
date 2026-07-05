import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { WebSocketServer } from "ws";
import { READING_TOOLS, SUBAGENT_TOOL_NAMES } from "../core/constants.js";
import type { ClientMessage, ServerMessage } from "../core/messages.js";
import { getSessionDir } from "../core/paths.js";
import { AgentStateStore } from "../server/agentStateStore.js";
import { FileWatcher } from "../server/fileWatcher.js";
import { handleHookEvent } from "../server/hookHandler.js";
import { HookServer } from "../server/hookServer.js";
import { agentSnapshotMessages } from "../server/stateActions.js";
import { createAgentState, type AgentState } from "../server/types.js";
import { extractFirstTask } from "../server/transcriptParser.js";

// ── Standalone CLI — ofisni brauzerda kuzatish (VS Code shart emas) ──
// `npx agent-office` → lokal server + WebSocket + brauzer SPA. Aniqlash
// pipeline'i extension bilan bir xil (JSONL watcher + hook server). Kuzatuv-
// only: terminal ochish/+Agent yo'q (u VS Code'ga xos).

const VERSION = "0.1.1";
const HEAD_BYTES = 8192;

// ── Argumentlar ──
const argv = process.argv.slice(2);
let port = 3100;
const paths: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--port" || a === "-p") port = parseInt(argv[++i], 10) || port;
  else if (a === "--help" || a === "-h") {
    console.log("agent-office — Claude Code agentlaringizni brauzerda 3D ofisda kuzating\n");
    console.log("Foydalanish: agent-office [loyiha-yo'li...] [--port 3100]\n");
    console.log("  loyiha-yo'li   Kuzatiladigan loyiha papkasi (default: joriy papka)");
    console.log("  --port, -p     HTTP/WS porti (default: 3100)");
    process.exit(0);
  } else if (!a.startsWith("-")) paths.push(path.resolve(a));
}
if (paths.length === 0) paths.push(process.cwd());

// ── Aniqlash pipeline'i ──
const store = new AgentStateStore();
const watcher = new FileWatcher(store);
watcher.start();

const startupTime = Date.now();
const dirs = paths.map((p) => ({ dir: getSessionDir(p), folderName: path.basename(p) }));

function readFirstTask(filePath: string): string {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
    return extractFirstTask(buf.toString("utf8", 0, n));
  } catch {
    return "Claude Code sessiya";
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

function adopt(filePath: string, folderName: string): AgentState | null {
  const sessionId = path.basename(filePath, ".jsonl");
  if (store.findByFile(filePath) || store.findBySession(sessionId)) return null;
  const id = store.allocateId();
  const agent = createAgentState(id, filePath, folderName, { isExternal: true, sessionId, task: readFirstTask(filePath) });
  watcher.primeFromStart(agent);
  store.add(agent);
  watcher.emitSnapshot(agent);
  return agent;
}

function scan(): void {
  for (const { dir, folderName } of dirs) {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".jsonl")) continue;
      const filePath = path.join(dir, name);
      const sid = path.basename(name, ".jsonl");
      if (store.findByFile(filePath) || store.findBySession(sid)) continue;
      try {
        if (fs.statSync(filePath).mtimeMs < startupTime) continue;
      } catch {
        continue;
      }
      adopt(filePath, folderName);
    }
  }
  // Fayli o'chirilgan agentlarni tozalaymiz
  for (const a of store.values()) {
    if (!fs.existsSync(a.filePath)) store.remove(a.id);
  }
}
setInterval(scan, 1000);
scan();

// ── Hook server (ixtiyoriy — extension bilan bir xil detektsiya) ──
let hookActive = false;
function inProjects(cwd: string): boolean {
  const norm = (p: string) => path.resolve(p).replace(/[\\/]+$/, "").toLowerCase();
  const c = norm(cwd);
  return paths.some((p) => c === norm(p) || c.startsWith(norm(p) + path.sep.toLowerCase()) || c.startsWith(norm(p) + "/"));
}
const hookServer = new HookServer((sessionId, raw) => {
  let agent = store.findBySession(sessionId);
  if (!agent) {
    const cwd = typeof raw.cwd === "string" ? raw.cwd : undefined;
    if (!cwd || !inProjects(cwd)) return;
    agent = adopt(path.join(getSessionDir(cwd), `${sessionId}.jsonl`), path.basename(cwd)) ?? undefined;
    if (agent) agent.sessionId = sessionId;
  }
  if (agent) handleHookEvent(store, agent, raw);
});
void hookServer.start().then((h) => {
  hookActive = !!h;
  broadcastAll({ type: "hookStatus", active: hookActive });
});

// ── Layout persistensiyasi (extension bilan BIR XIL fayl — ulashiladi) ──
function layoutPath(): string {
  return path.join(os.homedir(), ".agent-office", "layout.json");
}
function loadLayout(): { items: unknown[]; floorColor: string | null; packs: unknown[] } {
  try {
    const o = JSON.parse(fs.readFileSync(layoutPath(), "utf8"));
    return {
      items: Array.isArray(o?.items) ? o.items : [],
      floorColor: typeof o?.floorColor === "string" ? o.floorColor : null,
      packs: Array.isArray(o?.packs) ? o.packs : [],
    };
  } catch {
    return { items: [], floorColor: null, packs: [] };
  }
}
function saveLayout(items: unknown[], floorColor: string | null, packs: unknown[]): void {
  try {
    const p = layoutPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ items, floorColor, packs }));
    fs.renameSync(tmp, p);
  } catch {
    /* ignore */
  }
}

// ── HTTP: statik webview ──
const WEB_ROOT = path.join(__dirname, "webview");
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || "/").split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const filePath = path.join(WEB_ROOT, path.normalize(rel));
  if (!filePath.startsWith(WEB_ROOT)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

// ── WebSocket bridge ──
const wss = new WebSocketServer({ server });
const clients = new Set<import("ws").WebSocket>();

function broadcastAll(msg: ServerMessage): void {
  const s = JSON.stringify(msg);
  for (const c of clients) if (c.readyState === c.OPEN) c.send(s);
}

// Store hodisalarini barcha brauzerlarga uzatamiz.
store.on("broadcast", (m: ServerMessage) => broadcastAll(m));
store.on("agentAdded", (a: AgentState) => broadcastAll({ type: "agentCreated", id: a.id, folderName: a.folderName, isExternal: a.isExternal, role: a.role, task: a.task }));
store.on("agentRemoved", (id: number) => broadcastAll({ type: "agentClosed", id }));

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("message", (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    handleClient(msg, ws);
  });
  ws.on("close", () => clients.delete(ws));
});

function handleClient(msg: ClientMessage, ws: import("ws").WebSocket): void {
  const send = (m: ServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
  switch (msg.type) {
    case "webviewReady":
      sendSnapshot(send);
      break;
    case "saveLayout":
      saveLayout(msg.items, msg.floorColor ?? null, msg.packs ?? []);
      break;
    case "closeAgent":
      store.remove(msg.id);
      break;
    // focusAgent / launchAgent / setSoundEnabled — CLI'da ma'nosiz (terminal yo'q)
  }
}

function sendSnapshot(send: (m: ServerMessage) => void): void {
  send({ type: "providerCapabilities", readingTools: [...READING_TOOLS], subagentToolNames: [...SUBAGENT_TOOL_NAMES] });
  send({ type: "settingsLoaded", soundEnabled: true, extensionVersion: VERSION });
  send({ type: "workspaceFolders", folders: paths.map((p) => ({ name: path.basename(p), path: p })) });
  send({ type: "hookStatus", active: hookActive });
  const lay = loadLayout();
  send({ type: "layoutLoaded", items: lay.items as never, floorColor: lay.floorColor, packs: lay.packs });
  const agents = store.values();
  send({
    type: "existingAgents",
    agents: agents.map((a) => a.id),
    folderNames: Object.fromEntries(agents.map((a) => [a.id, a.folderName])),
    roles: Object.fromEntries(agents.filter((a) => a.role).map((a) => [a.id, a.role!])),
  });
  for (const a of agents) for (const m of agentSnapshotMessages(a)) send(m);
}

server.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`\n  🏢 Agent Office — ${url}`);
  console.log(`  Kuzatilayotgan: ${paths.join(", ")}`);
  console.log(`  Hook: ${hookActive ? "faol" : "JSONL zaxira"} · to'xtatish: Ctrl+C\n`);
});
server.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EADDRINUSE") console.error(`Port ${port} band. Boshqa port: agent-office --port ${port + 1}`);
  else console.error("Server xatosi:", e.message);
  process.exit(1);
});

process.on("SIGINT", () => {
  watcher.stop();
  hookServer.stop();
  server.close();
  process.exit(0);
});
