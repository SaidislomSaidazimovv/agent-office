import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AgentManager } from "../extension/vscode/agentManager.js";
import { AgentStateStore } from "../extension/server/agentStateStore.js";
import { FileWatcher } from "../extension/server/fileWatcher.js";
import { areHooksInstalled, installHooks, uninstallHooks } from "../extension/vscode/hookInstaller.js";
import { handleHookEvent } from "../extension/server/hookHandler.js";
import { processTranscriptLine } from "../extension/server/transcriptParser.js";
import { permissionDelayFor } from "../extension/server/stateActions.js";
import { createAgentState } from "../extension/server/types.js";
import { NODES, nearestNode, pathBetween } from "../webview-ui/src/scene/nav.js";
import { blocked } from "../webview-ui/src/scene/collision.js";
import { seatFor, sitPoint } from "../webview-ui/src/scene/roles.js";
import { useOffice } from "../webview-ui/src/store.js";
import { _state, fireClose, makeTerminal, resetState } from "./vscodeMock.js";

let passed = 0;
let failed = 0;
type Msg = { type: string; status?: string; awaitingInput?: boolean };

function setup() {
  const store = new AgentStateStore();
  const agent = createAgentState(1, "/x/sess.jsonl", "proj", { sessionId: "s" });
  store.add(agent);
  const ev: Msg[] = [];
  store.on("broadcast", (m: Msg) => ev.push(m));
  return { store, agent, ev };
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log("  ✓", name);
  } catch (e) {
    failed++;
    console.log("  ✗", name, "\n     ", (e as Error).message);
  }
}

console.log("Transcript parser:");
test("assistant tool_use → active + toolStart with file label", () => {
  const { store, agent, ev } = setup();
  processTranscriptLine(store, agent, JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: "src/App.tsx" } }] } }));
  assert.ok(ev.some((e) => e.type === "agentStatus" && e.status === "active"), "no active");
  const ts = ev.find((e) => e.type === "agentToolStart") as { status?: string } | undefined;
  assert.ok(ts && ts.status!.includes("App.tsx"), "tool label missing file");
});

test("thinking blok → agent faol (active), sukunat-taymer yo'q", () => {
  const { store, agent, ev } = setup();
  processTranscriptLine(store, agent, JSON.stringify({ type: "assistant", message: { content: [{ type: "thinking", thinking: "hmm..." }] } }));
  assert.ok(ev.some((e) => e.type === "agentStatus" && e.status === "active"), "thinking → active bo'lishi kerak");
  assert.equal(agent.waitingTimer, undefined, "thinking sukunat-taymer boshlamasligi kerak");
});

test("turn_duration → waiting (Done)", () => {
  const { store, agent, ev } = setup();
  processTranscriptLine(store, agent, JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }] } }));
  processTranscriptLine(store, agent, JSON.stringify({ type: "system", subtype: "turn_duration" }));
  assert.equal(agent.isWaiting, true);
  assert.ok(ev.some((e) => e.type === "agentStatus" && e.status === "waiting"), "no waiting");
});

test("context tokens = input + cache_read + cache_creation", () => {
  const { store, agent } = setup();
  processTranscriptLine(store, agent, JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hi" }], usage: { input_tokens: 2, cache_read_input_tokens: 100000, cache_creation_input_tokens: 500, output_tokens: 50 } } }));
  assert.equal(agent.inputTokens, 100502);
  assert.equal(agent.outputTokens, 50);
});

test("default context window is 200k; token usage broadcasts it", () => {
  const { store, agent, ev } = setup();
  assert.equal(agent.contextWindow, 200000);
  processTranscriptLine(store, agent, JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", content: [{ type: "text", text: "hi" }], usage: { input_tokens: 5000, output_tokens: 10 } } }));
  const tu = ev.find((e) => e.type === "agentTokenUsage") as { contextWindow?: number } | undefined;
  assert.equal(tu?.contextWindow, 200000);
});

test("context >200k auto-upgrades window to 1M (model string lacks [1m])", () => {
  const { store, agent } = setup();
  processTranscriptLine(store, agent, JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", content: [{ type: "text", text: "x" }], usage: { input_tokens: 10, cache_read_input_tokens: 540000, output_tokens: 5 } } }));
  assert.equal(agent.contextWindow, 1000000, "should detect 1M from token volume");
  assert.ok(agent.inputTokens / agent.contextWindow <= 1, "% must be <= 100");
});

test("model id with [1m] sets 1M window immediately", () => {
  const { store, agent } = setup();
  processTranscriptLine(store, agent, JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8[1m]", content: [{ type: "text", text: "x" }], usage: { input_tokens: 100, output_tokens: 5 } } }));
  assert.equal(agent.contextWindow, 1000000);
});

test("bypassPermissions rejimda o'zgartiruvchi tool ruxsat-taymer QO'YMAYDI", () => {
  const { store, agent } = setup();
  processTranscriptLine(store, agent, JSON.stringify({ type: "permission-mode", permissionMode: "bypassPermissions" }));
  processTranscriptLine(store, agent, JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "npm run build" } }] } }));
  assert.equal(agent.permissionMode, "bypassPermissions");
  assert.equal(agent.permissionTimer, undefined, "bypass rejimda false-positive taymer bo'lmasligi kerak");
});

test("default rejimda o'zgartiruvchi tool ruxsat-taymer qo'yadi", () => {
  const { store, agent } = setup();
  processTranscriptLine(store, agent, JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: "a.ts" } }] } }));
  assert.ok(agent.permissionTimer, "default rejimda Edit taymer qo'yishi kerak");
  clearTimeout(agent.permissionTimer);
});

test("default rejimda read-only tool taymer QO'YMAYDI (exempt)", () => {
  const { store, agent } = setup();
  processTranscriptLine(store, agent, JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } }] } }));
  assert.equal(agent.permissionTimer, undefined, "Read exempt — taymer bo'lmasligi kerak");
});

test("permissionDelayFor: Edit tez, Bash sekin, Read/bypass → null", () => {
  const fast = permissionDelayFor("Edit", "default");
  const slow = permissionDelayFor("Bash", "default");
  assert.ok(fast && slow && slow > fast, "Bash Edit'dan uzoqroq kutishi kerak");
  assert.equal(permissionDelayFor("Read", "default"), null, "read-only exempt");
  assert.equal(permissionDelayFor("Bash", "bypassPermissions"), null, "bypass → taymer yo'q");
  assert.equal(permissionDelayFor("Write", "auto"), null, "auto → taymer yo'q");
});

test("rejim default→auto o'zgarsa faol ruxsat tozalanadi", () => {
  const { store, agent, ev } = setup();
  agent.permissionActive = true;
  processTranscriptLine(store, agent, JSON.stringify({ type: "permission-mode", permissionMode: "auto" }));
  assert.equal(agent.permissionActive, false, "faol ruxsat tozalanishi kerak");
  assert.ok(ev.some((e) => e.type === "agentToolPermissionClear"), "clear broadcast bo'lishi kerak");
});

test("is_error tool_result → blocked; keyingi toza natija → tozalanadi", () => {
  const { store, agent, ev } = setup();
  processTranscriptLine(store, agent, JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: true }] } }));
  assert.equal(agent.blocked, true, "xato → blocked");
  assert.ok(ev.some((e) => e.type === "agentBlocked" && (e as { blocked?: boolean }).blocked === true), "agentBlocked broadcast");
  processTranscriptLine(store, agent, JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t2" }] } }));
  assert.equal(agent.blocked, false, "toza natija bloklovni tozalashi kerak");
});

test("api_error → blocked; yangi user so'rovi → tozalanadi", () => {
  const { store, agent } = setup();
  processTranscriptLine(store, agent, JSON.stringify({ type: "system", subtype: "api_error" }));
  assert.equal(agent.blocked, true);
  processTranscriptLine(store, agent, JSON.stringify({ type: "user", message: { content: "yangi so'rov" } }));
  assert.equal(agent.blocked, false, "yangi navbat xatoni tozalashi kerak");
});

console.log("Hook handler:");
test("PreToolUse → active + toolStart; Stop → waiting; hookDelivered set", () => {
  const { store, agent, ev } = setup();
  handleHookEvent(store, agent, { hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "db.ts" } });
  assert.equal(agent.hookDelivered, true);
  const ts = ev.find((e) => e.type === "agentToolStart") as { status?: string } | undefined;
  assert.ok(ts && ts.status!.includes("db.ts"), "hook tool label");
  handleHookEvent(store, agent, { hook_event_name: "Stop" });
  assert.equal(agent.isWaiting, true);
});

test("Notification permission → agentToolPermission", () => {
  const { store, agent, ev } = setup();
  handleHookEvent(store, agent, { hook_event_name: "Notification", message: "Claude needs your permission to use Bash" });
  assert.ok(ev.some((e) => e.type === "agentToolPermission"), "no permission event");
});

test("Notification 'waiting for input' → awaiting (permission EMAS)", () => {
  const { store, agent, ev } = setup();
  handleHookEvent(store, agent, { hook_event_name: "Notification", message: "Claude is waiting for your input" });
  assert.ok(ev.some((e) => e.type === "agentStatus" && (e as { awaitingInput?: boolean }).awaitingInput === true), "awaiting bo'lishi kerak");
  assert.ok(!ev.some((e) => e.type === "agentToolPermission"), "permission YASALMASLIGI kerak");
});

test("noma'lum Notification → soxta permission YASAMAYDI", () => {
  const { store, agent, ev } = setup();
  handleHookEvent(store, agent, { hook_event_name: "Notification", message: "Background task finished" });
  assert.ok(!ev.some((e) => e.type === "agentToolPermission"), "noma'lum xabar permission bermasligi kerak");
});

test("hook: tool tugagach ruxsat pufagi tozalanadi", () => {
  const { store, agent, ev } = setup();
  handleHookEvent(store, agent, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "x" } });
  handleHookEvent(store, agent, { hook_event_name: "Notification", message: "Claude needs your permission" });
  assert.equal(agent.permissionActive, true);
  handleHookEvent(store, agent, { hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "x" } });
  assert.equal(agent.permissionActive, false, "PostToolUse ruxsatni tozalashi kerak");
  assert.ok(ev.some((e) => e.type === "agentToolPermissionClear"), "clear broadcast");
});

test("JSONL tool boshlangach birinchi hook — eski tool osilmaydi (tozalanadi)", () => {
  const { store, agent, ev } = setup();
  // JSONL rejimida tool boshlanadi (hook hali yo'q)
  processTranscriptLine(store, agent, JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "sleep 100" } }] } }));
  assert.equal(agent.activeToolIds.size, 1);
  assert.equal(agent.hookDelivered, false);
  // birinchi hook keladi (tool bilan bog'liq emas) — handoff eski toolni tozalashi kerak
  handleHookEvent(store, agent, { hook_event_name: "UserPromptSubmit" });
  assert.equal(agent.hookDelivered, true);
  assert.equal(agent.activeToolIds.size, 0, "eski JSONL tool tozalanishi kerak (osilmasin)");
  assert.ok(ev.some((e) => e.type === "agentToolsClear"), "agentToolsClear broadcast bo'lishi kerak");
});

test("handoff: JSONL permission taymeri hook rejimida false-positive bermaydi", () => {
  const { store, agent } = setup();
  agent.permissionActive = true;
  handleHookEvent(store, agent, { hook_event_name: "Stop" });
  assert.equal(agent.permissionActive, false, "JSONL permission handoff'da tozalanishi kerak");
});

test("hook PostToolUseFailure → blocked; PostToolUse → tozalanadi", () => {
  const { store, agent } = setup();
  handleHookEvent(store, agent, { hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "x" } });
  assert.equal(agent.blocked, true);
  handleHookEvent(store, agent, { hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: "a" } });
  assert.equal(agent.blocked, false, "muvaffaqiyat bloklovni tozalashi kerak");
});

test("parallel tools: har biri to'g'ri yopiladi (biri qotib qolmaydi)", () => {
  const { store, agent } = setup();
  // 3 ta tool parallel boshlanadi (PreToolUse x3 ketma-ket, PostToolUse'dan oldin)
  handleHookEvent(store, agent, { hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "a.ts" } });
  handleHookEvent(store, agent, { hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "b.ts" } });
  handleHookEvent(store, agent, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } });
  assert.equal(agent.activeToolIds.size, 3, "3 tool faol bo'lishi kerak");
  // Teskari tartibda tugaydi — imzo bo'yicha to'g'ri moslanadi
  handleHookEvent(store, agent, { hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "ls" } });
  handleHookEvent(store, agent, { hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: "a.ts" } });
  handleHookEvent(store, agent, { hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: "b.ts" } });
  assert.equal(agent.activeToolIds.size, 0, "hamma tool yopilishi kerak (hech biri qotib qolmasin)");
});

test("parallel: subagent + oddiy tool aralash — ajratib yopiladi", () => {
  const { store, agent } = setup();
  handleHookEvent(store, agent, { hook_event_name: "PreToolUse", tool_name: "Task", tool_input: { prompt: "sub" } });
  handleHookEvent(store, agent, { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "x.ts" } });
  assert.equal(agent.subagentToolIds.size, 1);
  assert.equal(agent.activeToolIds.size, 1);
  // Oddiy tool tugadi — subagent teginmaydi
  handleHookEvent(store, agent, { hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: "x.ts" } });
  assert.equal(agent.activeToolIds.size, 0, "oddiy tool yopildi");
  assert.equal(agent.subagentToolIds.size, 1, "subagent hali faol bo'lishi kerak");
  // Subagent tugadi
  handleHookEvent(store, agent, { hook_event_name: "PostToolUse", tool_name: "Task", tool_input: { prompt: "sub" } });
  assert.equal(agent.subagentToolIds.size, 0, "subagent yopildi");
});

console.log("Terminal binding (cwd bo'yicha):");
const WS = "F:\\zzz-bind-ws-unlikely-path";
function mgrSetup() {
  resetState(WS);
  const store = new AgentStateStore();
  const watcher = { primeFromStart() {}, emitSnapshot() {} } as unknown as import("../extension/server/fileWatcher.js").FileWatcher;
  const mgr = new AgentManager(store, watcher, () => {});
  mgr.start();
  return { store, mgr };
}

test("cwd-mos terminal (nomi 'Claude Code' bo'lmasa ham) bog'lanadi → yopilsa agent o'chadi", () => {
  const { store, mgr } = mgrSetup();
  const t = makeTerminal({ name: "pwsh", cwd: WS });
  _state.activeTerminal = t;
  const a = mgr.ensureSessionAgent("sess-1", WS);
  assert.ok(store.has(a.id), "adopt bo'lmadi");
  fireClose(t);
  assert.equal(store.has(a.id), false, "terminal yopilsa agent o'chishi kerak");
});

test("mos kelmaydigan terminal yopilsa agent NOTO'G'RI o'chirilmaydi", () => {
  const { store, mgr } = mgrSetup();
  const other = makeTerminal({ name: "pwsh", cwd: "C:\\butunlay\\boshqa" });
  const a = mgr.ensureSessionAgent("sess-2", WS);
  fireClose(other);
  assert.equal(store.has(a.id), true, "boshqa papka terminali agentga tegmasin");
});

test("cwd noma'lum faol terminal → fallback bog'lanadi", () => {
  const { store, mgr } = mgrSetup();
  const t = makeTerminal({ name: "bash" }); // shell-integration yo'q
  _state.activeTerminal = t;
  const a = mgr.ensureSessionAgent("sess-3", WS);
  fireClose(t);
  assert.equal(store.has(a.id), false, "cwd noma'lum bo'lsa faol terminalga bog'lanishi kerak");
});

test("kech-bog'lash: terminal keyin ochilsa focusAgent bog'laydi", () => {
  const { store, mgr } = mgrSetup();
  const a = mgr.ensureSessionAgent("sess-4", WS); // terminal hali yo'q
  assert.ok(store.has(a.id));
  const t = makeTerminal({ name: "pwsh", cwd: WS });
  mgr.focusAgent(a.id);
  fireClose(t);
  assert.equal(store.has(a.id), false, "focusAgent kech-bog'lashi kerak");
});

console.log("Hook installer (settings.json xavfsizligi):");
function tmpSettings(content?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ao-set"));
  const f = path.join(dir, "settings.json");
  if (content !== undefined) fs.writeFileSync(f, content);
  return f;
}
const SCRIPT = "/x/dist/hooks/claude-hook.js";

test("BUZUQ settings.json → yozmaydi, foydalanuvchi ma'lumoti SAQLANADI", () => {
  const corrupt = '{ "theme": "dark", "important": true,, }'; // buzuq JSON
  const f = tmpSettings(corrupt);
  const ok = installHooks(SCRIPT, f);
  assert.equal(ok, false, "buzuq faylda false qaytishi kerak");
  assert.equal(fs.readFileSync(f, "utf8"), corrupt, "fayl O'ZGARMASLIGI kerak (ma'lumot yo'qolmasin)");
});

test("yaroqli settings → hook qo'shiladi, mavjud kalitlar saqlanadi", () => {
  const f = tmpSettings(JSON.stringify({ theme: "dark", editor: { fontSize: 14 } }));
  assert.equal(installHooks(SCRIPT, f), true);
  const s = JSON.parse(fs.readFileSync(f, "utf8"));
  assert.equal(s.theme, "dark", "mavjud sozlama saqlanishi kerak");
  assert.equal(s.editor.fontSize, 14, "ichki sozlama saqlanishi kerak");
  assert.ok(s.hooks && s.hooks.PreToolUse, "hooks qo'shilishi kerak");
  assert.equal(areHooksInstalled(SCRIPT, f), true);
});

test("bo'sh/mavjud bo'lmagan settings → yangi fayl yaratiladi", () => {
  const f = tmpSettings(); // fayl yo'q
  assert.equal(installHooks(SCRIPT, f), true);
  assert.ok(JSON.parse(fs.readFileSync(f, "utf8")).hooks, "hooks bilan yaratilishi kerak");
});

test("uninstall faqat bizning hookni oladi, boshqasini saqlaydi", () => {
  const f = tmpSettings(JSON.stringify({ hooks: { Stop: [{ matcher: "*", hooks: [{ type: "command", command: "node /boshqa/hook.js" }] }] } }));
  installHooks(SCRIPT, f);
  uninstallHooks(SCRIPT, f);
  const s = JSON.parse(fs.readFileSync(f, "utf8"));
  assert.ok(!areHooksInstalled(SCRIPT, f), "bizning hook o'chirilishi kerak");
  assert.ok(s.hooks.Stop.some((g: { hooks: { command: string }[] }) => g.hooks.some((h) => h.command === "node /boshqa/hook.js")), "boshqa hook saqlanishi kerak");
});

console.log("Launch: 'claude' PATH-fail zombi tozalanadi:");
test("transcript 20s'da paydo bo'lmasa agent olib tashlanadi", () => {
  const { store, mgr } = mgrSetup();
  mgr.launchAgent({});
  const agent = store.values()[0];
  assert.ok(agent, "launch agent yaratishi kerak");
  // transcript fayli mavjud emas (createTerminal mock, claude yozmaydi)
  (mgr as unknown as { checkLaunchStalled(id: number, f: string): void }).checkLaunchStalled(agent.id, agent.filePath);
  assert.equal(store.has(agent.id), false, "transcript yo'q → zombi olib tashlanishi kerak");
});

console.log("/clear|/resume dublikatsizlik:");
test("single-agent /clear → o'sha agent reassign bo'ladi (dublikat yo'q)", () => {
  const { store, mgr } = mgrSetup();
  const t = makeTerminal({ name: "pwsh", cwd: WS });
  _state.activeTerminal = t;
  const a = mgr.ensureSessionAgent("old-1", WS);
  const before = store.values().length;
  const re = mgr.reassignForClear("new-1", WS);
  assert.ok(re && re.id === a.id, "o'sha agent qayta biriktirilishi kerak");
  assert.equal(re!.sessionId, "new-1");
  assert.equal(store.values().length, before, "yangi agent yaratilmasligi kerak (dublikat yo'q)");
});

test("ko'p agent /clear → faol terminalga bog'langan agent tanlanadi", () => {
  const { mgr } = mgrSetup();
  const t1 = makeTerminal({ name: "pwsh", cwd: WS });
  _state.activeTerminal = t1;
  const a1 = mgr.ensureSessionAgent("a-1", WS);
  const t2 = makeTerminal({ name: "pwsh", cwd: WS });
  _state.activeTerminal = t2;
  const a2 = mgr.ensureSessionAgent("a-2", WS);
  _state.activeTerminal = t1; // /clear t1'da bo'ldi
  const re = mgr.reassignForClear("a-3", WS);
  assert.ok(re && re.id === a1.id, "faol terminal (t1) agenti tanlanishi kerak");
  assert.equal(a2.sessionId, "a-2", "boshqa agent tegilmasligi kerak");
});

test("ko'p agent, faol terminal mos emas → null (noto'g'ri biriktirmaydi)", () => {
  const { mgr } = mgrSetup();
  const t1 = makeTerminal({ name: "pwsh", cwd: WS });
  _state.activeTerminal = t1;
  mgr.ensureSessionAgent("b-1", WS);
  const t2 = makeTerminal({ name: "pwsh", cwd: WS });
  _state.activeTerminal = t2;
  mgr.ensureSessionAgent("b-2", WS);
  const other = makeTerminal({ name: "pwsh", cwd: "C:\\boshqa" });
  _state.activeTerminal = other; // mos kelmaydigan terminal faol
  const re = mgr.reassignForClear("b-3", WS);
  assert.equal(re, null, "disambiguatsiya yo'q — null qaytishi kerak");
});

console.log("O'rindiq taqsimoti (ustma-ust yo'q):");
test("11 agent → 11 xil o'rindiq (7-agent 0-o'ringa tushmaydi)", () => {
  const store = useOffice.getState();
  for (let i = 1; i <= 11; i++) store.addAgent({ id: i, folderName: "p" + i });
  const agents = Object.values(useOffice.getState().agents);
  assert.equal(agents.length, 11, "11 agent qo'shilishi kerak");
  const seats = agents.map((a) => a.seatIndex);
  assert.equal(new Set(seats).size, 11, "har agentda UNIKAL o'rindiq indeksi bo'lishi kerak");
  // World-koordinatalar ham ustma-ust emas (generatsiya qilinganlar ham)
  const pts = agents.map((a) => { const s = seatFor(a.seatIndex); return `${s.x},${s.z}`; });
  assert.equal(new Set(pts).size, 11, "world pozitsiyalar ustma-ust bo'lmasligi kerak");
});

console.log("FileWatcher UTF-8 chegara:");
test("64KB chegarada bo'lingan ko'p-baytli belgi buzilmaydi (StringDecoder)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ao-utf"));
  const file = path.join(dir, "sess.jsonl");
  const mb = "o‘"; // o‘ — UTF-8'da 2 bayt
  const head = `{"type":"assistant","message":{"pad":"`;
  const mid = `","content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"`;
  // 'o‘' belgisining birinchi bayti aynan 65535-offsetda bo'lsin → 65536 chunk
  // chegarasi belgini ikkiga bo'ladi.
  const padLen = 65535 - Buffer.byteLength(head) - Buffer.byteLength(mid);
  assert.ok(padLen > 0, "pad musbat bo'lishi kerak");
  const line = head + "A".repeat(padLen) + mid + `${mb}x.ts"}}]}}`;
  fs.writeFileSync(file, line + "\n");

  const store = new AgentStateStore();
  const watcher = new FileWatcher(store);
  const agent = createAgentState(1, file, "t");
  watcher.primeFromStart(agent);

  assert.ok(agent.currentToolLabel?.includes(mb), "ko'p-baytli belgi butun qolishi kerak");
  assert.ok(!agent.currentToolLabel?.includes("�"), "U+FFFD (buzilgan belgi) bo'lmasligi kerak");
  fs.rmSync(dir, { recursive: true, force: true });
});

console.log("Adopt: tarix jimgina o'qiladi (flood yo'q):");
test("primeFromStart broadcast QILMAYDI, holatni tiklaydi; emitSnapshot yakuniy holat", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ao-"));
  const file = path.join(dir, "sess.jsonl");
  const lines = [
    JSON.stringify({ type: "user", message: { content: "salom" } }),
    JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: "a.ts" } }], usage: { input_tokens: 10, cache_read_input_tokens: 5000, output_tokens: 3 } } }),
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1" }] } }),
    JSON.stringify({ type: "system", subtype: "turn_duration" }),
  ];
  fs.writeFileSync(file, lines.join("\n") + "\n");
  const store = new AgentStateStore();
  const watcher = new FileWatcher(store);
  const ev: { type: string; inputTokens?: number }[] = [];
  store.on("broadcast", (m: { type: string; inputTokens?: number }) => ev.push(m));
  const agent = createAgentState(1, file, "t");

  watcher.primeFromStart(agent);
  assert.equal(ev.length, 0, "prime davomida broadcast bo'lmasligi kerak (silent — flood yo'q)");
  assert.equal(agent.inputTokens, 5010, "tokenlar tarixdan tiklanishi kerak");
  assert.equal(agent.isWaiting, true, "turn_duration → waiting");

  watcher.emitSnapshot(agent);
  assert.ok(ev.length >= 2, "emitSnapshot yakuniy holatni yuborishi kerak");
  assert.ok(ev.some((m) => m.type === "agentTokenUsage" && m.inputTokens === 5010), "token snapshot bo'lishi kerak");
  fs.rmSync(dir, { recursive: true, force: true });
});

console.log("Status hisoblash (collab ota-statusni bosmaydi):");
test("ota kod yozayotgan + subagent bor → 'working' (collab emas)", () => {
  const s = useOffice.getState();
  s.addAgent({ id: 200, folderName: "par" });
  s.setActive(200, true);
  s.setTool(200, "Edit", "Edit a.ts");
  s.addSubagent(200, "sub-1");
  assert.equal(useOffice.getState().agents[200].status, "working", "ota ishlayotganda working bo'lishi kerak");
});
test("ota bo'sh + subagent ishlayotgan → 'collab'", () => {
  const s = useOffice.getState();
  s.addAgent({ id: 201, folderName: "par2" });
  s.setActive(201, true);
  s.addSubagent(201, "sub-1");
  assert.equal(useOffice.getState().agents[201].status, "collab");
});
test("blocked flag → status 'blocked' (o'lik status endi jonli)", () => {
  const s = useOffice.getState();
  s.addAgent({ id: 202, folderName: "b" });
  s.setActive(202, true);
  s.setTool(202, "Bash", "Bash x");
  s.setBlocked(202, true);
  assert.equal(useOffice.getState().agents[202].status, "blocked", "blocked working'ni bosishi kerak");
  s.setBlocked(202, false);
  assert.equal(useOffice.getState().agents[202].status, "working", "tozalansa asl status");
});

console.log("Collision: overflow o'rindiqlar to'siqlangan:");
test("overflow stol (>10) markazi bloklangan, sit nuqtasi ochiq", () => {
  const s = seatFor(13); // overflow o'rindiq (SEATS'dan tashqari)
  assert.ok(blocked(s.x, s.z, 0.16), "overflow stol markazi bloklangan bo'lishi kerak (o'tib ketmasin)");
  const sit = sitPoint(s);
  assert.ok(!blocked(sit.x, sit.z, 0.16), "sit nuqtasi ochiq — agent o'tira olishi kerak");
});
test("asosiy o'rindiq: stol bloklangan, sit ochiq (regressiya)", () => {
  for (const i of [0, 5, 9]) {
    const s = seatFor(i);
    assert.ok(blocked(s.x, s.z, 0.16), `seat ${i} stol bloklangan`);
    const sit = sitPoint(s);
    assert.ok(!blocked(sit.x, sit.z, 0.16), `seat ${i} sit ochiq`);
  }
});

console.log("Navigation:");
test("pathBetween reaches a room interior through its door", () => {
  const p = pathBetween(nearestNode(0, 0), "server_i");
  assert.ok(p.length >= 2, "path too short");
  assert.deepEqual(p[p.length - 1], NODES["server_i"], "path does not end at room");
});

test("hech bir xona ichki nuqtasi mebel ichida emas (agent titramaydi)", () => {
  const rooms = ["server", "kitchen", "meeting", "bathroom", "glassA", "library", "focus", "lounge", "glassB", "glassC"];
  for (const key of rooms) {
    const n = NODES[`${key}_i`];
    assert.ok(n, `${key}_i mavjud bo'lishi kerak`);
    assert.ok(!blocked(n.x, n.z, 0.3), `${key} ichki nuqtasi (${n.x},${n.z}) mebeldan tashqarida bo'lishi kerak`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
