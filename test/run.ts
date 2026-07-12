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
import { MAX_NAME_LEN, needsAttention, newlyStuck, sanitizeName, statusText, STUCK_MS, summarize } from "../extension/core/attention.js";
import { formatError, formatSubagent, MAX_ERROR_LEN, permissionDelayFor } from "../extension/server/stateActions.js";
import { createAgentState } from "../extension/server/types.js";
import { budgetState } from "../webview-ui/src/budget.js";
import { buildReport } from "../webview-ui/src/report.js";
import { cacheStats } from "../webview-ui/src/pricing.js";
import { matchAgents } from "../webview-ui/src/search.js";
import { dprFor, shadowEvery, useSettings } from "../webview-ui/src/settings.js";
import { EDGES, NODES, nearestNode, pathBetween } from "../webview-ui/src/scene/nav.js";
import { blocked, setActiveSeats } from "../webview-ui/src/scene/collision.js";
import { CLUTTER_TIERS, clutterLevel, MAX_CLUTTER } from "../webview-ui/src/scene/clutter.js";
import { contextHot, emoteFor } from "../webview-ui/src/scene/emotes.js";
import { _reset as presenceReset, meetingOf, report, seekMeeting } from "../webview-ui/src/scene/presence.js";
import { seatFor, sitPoint } from "../webview-ui/src/scene/roles.js";
import { displayName, useOffice } from "../webview-ui/src/store.js";
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

test("versiya yangilanganda eski hook tozalanadi (to'planmaydi)", () => {
  const f = tmpSettings();
  installHooks("/old/v1/dist/hooks/claude-hook.js", f);
  installHooks("/new/v2/dist/hooks/claude-hook.js", f);
  const s = JSON.parse(fs.readFileSync(f, "utf8"));
  const cmds = (Object.values(s.hooks) as { hooks: { command: string }[] }[][]).flat().flatMap((g) => g.hooks).map((h) => h.command);
  assert.ok(cmds.every((c) => !c.includes("/old/")), "eski versiya hooklari tozalanishi kerak");
  assert.ok(cmds.some((c) => c.includes("/new/")), "yangi versiya bo'lishi kerak");
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

test("launchAgent bypass → permissionMode=bypassPermissions (soxta pufak yo'q)", () => {
  const { store, mgr } = mgrSetup();
  mgr.launchAgent({ bypassPermissions: true });
  const a = store.values()[0];
  assert.equal(a.permissionMode, "bypassPermissions", "bypass rejim seed qilinishi kerak");
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

test("/clear stale blocked/permission/tool indikatorlarini tozalaydi", () => {
  const { mgr } = mgrSetup();
  const t = makeTerminal({ name: "pwsh", cwd: WS });
  _state.activeTerminal = t;
  const a = mgr.ensureSessionAgent("s1", WS);
  a.blocked = true;
  a.permissionActive = true;
  a.currentToolLabel = "Edit x.ts";
  const re = mgr.reassignForClear("s2", WS);
  assert.ok(re && re.id === a.id);
  assert.equal(re!.blocked, false, "blocked yangi sessiyaga o'tmasligi kerak");
  assert.equal(re!.permissionActive, false, "permission tozalanishi kerak");
  assert.equal(re!.currentToolLabel, undefined, "tool label tozalanishi kerak");
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
test("toolDone: sanoq 0ga tushsa yorliq tozalanadi (osilib qolmaydi)", () => {
  const s = useOffice.getState();
  s.addAgent({ id: 400, folderName: "t" });
  s.setTool(400, "Edit", "Edit a.ts");
  assert.equal(useOffice.getState().agents[400].toolLabel, "Edit a.ts");
  s.toolDone(400);
  assert.equal(useOffice.getState().agents[400].toolLabel, undefined, "sanoq 0da yorliq tozalanishi kerak");
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

console.log("Xarajat vaqt qatori (dashboard grafigi uchun):");
test("sample(): agent yo'q → namuna yo'q; agentlar bor → JORIY jami yoziladi", () => {
  useOffice.setState({ agents: {}, order: [], samples: [] });
  // Agent yo'q — grafikni bo'sh nollar bilan to'ldirmasligi kerak.
  useOffice.getState().sample();
  assert.equal(useOffice.getState().samples.length, 0, "agent yo'q — namuna olinmasligi kerak");

  const s = useOffice.getState();
  s.addAgent({ id: 300, folderName: "p" });
  s.addAgent({ id: 301, folderName: "p" });
  const a = useOffice.getState().agents;
  useOffice.setState({
    agents: {
      300: { ...a[300], costUsd: 1.5, inputTokens: 1000, outputTokens: 200, active: true },
      301: { ...a[301], costUsd: 0.5, inputTokens: 300, outputTokens: 50, active: false },
    },
  });
  useOffice.getState().sample();
  const smp = useOffice.getState().samples;
  assert.equal(smp.length, 1, "bitta namuna bo'lishi kerak");
  assert.ok(Math.abs(smp[0].cost - 2.0) < 1e-9, "jami xarajat 2.0 bo'lishi kerak");
  assert.equal(smp[0].inTok, 1300, "jami kirish tokeni 1300");
  assert.equal(smp[0].outTok, 250, "jami chiqish tokeni 250");
  assert.equal(smp[0].active, 1, "faqat 1 agent faol");
  useOffice.setState({ agents: {}, order: [], samples: [] }); // keyingi testlarga toza qoldiramiz
});

console.log("Budjet (FAQAT ogohlantirish — hech narsa to'xtatilmaydi):");
test("budgetState: limit yo'q → o'chiq; 80% → warn; 100% → over", () => {
  assert.equal(budgetState(5, 0).level, "off", "limit 0 → o'chiq");
  assert.equal(budgetState(5, -3).level, "off", "manfiy limit → o'chiq");
  assert.equal(budgetState(0.79, 1).level, "ok");
  assert.equal(budgetState(0.8, 1).level, "warn", "aynan 80% → ogohlantirish");
  assert.equal(budgetState(1, 1).level, "over", "aynan 100% → oshgan");
  assert.equal(budgetState(2, 1).level, "over");
  const b = budgetState(0.25, 1);
  assert.ok(Math.abs(b.frac - 0.25) < 1e-9, "ulush 0.25");
  assert.ok(Math.abs(b.left - 0.75) < 1e-9, "qolgani 0.75");
  assert.equal(budgetState(3, 1).left, 0, "oshib ketsa qolgani 0 (manfiy emas)");
});

console.log("Sessiya hisoboti (markdown eksport):");
test("buildReport: agent yo'q → jadvalsiz bo'sh holat", () => {
  const md = buildReport({ agents: [], now: 0, budgetUsd: 0, t: (k) => k });
  assert.ok(md.includes("dash.noData"), "bo'sh holat matni bo'lishi kerak");
  assert.ok(!md.includes("| ---"), "bo'sh hisobotda jadval bo'lmaydi");
});
test("buildReport: jamlar, saralash, model, budjet qatori va | ekranlash", () => {
  useOffice.setState({ agents: {}, order: [], samples: [] });
  const s = useOffice.getState();
  s.addAgent({ id: 400, folderName: "a|b", role: "frontend" }); // | → jadvalni buzmasligi kerak
  s.addAgent({ id: 401, folderName: "srv", role: "backend" });
  const a0 = useOffice.getState().agents;
  useOffice.setState({
    agents: {
      400: { ...a0[400], costUsd: 3, inputTokens: 20000, outputTokens: 2000, toolCalls: 7, turns: 2, activeMs: 65000, model: "claude-opus-4-8[1m]" },
      401: { ...a0[401], costUsd: 1, inputTokens: 5000, outputTokens: 500, toolCalls: 3, turns: 1, activeMs: 0 },
    },
  });
  const st = useOffice.getState();
  const agents = st.order.map((id) => st.agents[id]);
  const md = buildReport({ agents, now: 1_700_000_000_000, budgetUsd: 5, t: (k) => k });

  assert.ok(md.includes("a\\|b"), "folderName ichidagi | ekranlanishi kerak");
  assert.ok(md.includes("~$4.00"), "jami xarajat $4.00");
  assert.ok(md.includes("$4.00 / $5.00 · 80%"), "budjet qatori 80% ko'rsatishi kerak");
  assert.ok(md.indexOf("| a\\|b |") < md.indexOf("| srv |"), "qimmatroq agent yuqorida (xarajat bo'yicha saralash)");
  assert.ok(md.includes("Opus 4.8"), "model qisqa nomga aylanishi kerak");
  assert.ok(/\| srv \| role\.backend \| — \|/.test(md), "modeli noma'lum agent uchun —");
  assert.ok(md.includes("| role.frontend | $3.00 | 75% |"), "rol ulushi 75%");

  const noBudget = buildReport({ agents, now: 1_700_000_000_000, budgetUsd: 0, t: (k) => k });
  assert.ok(!noBudget.includes("budget.title"), "budjet o'chiq bo'lsa qator chiqmasligi kerak");
  useOffice.setState({ agents: {}, order: [], samples: [] });
});

console.log("Sub-agent daraxti (HAQIQIY tavsif — Task tool'idan):");
test("formatSubagent: description + subagent_type olinadi, uzuni qirqiladi", () => {
  const a = formatSubagent({ description: "  Find   flaky  tests ", subagent_type: " Explore ", prompt: "..." });
  assert.equal(a.label, "Find flaky tests", "bo'shliqlar normallashadi");
  assert.equal(a.kind, "Explore");
  const b = formatSubagent({});
  assert.equal(b.label, "", "tavsif yo'q → bo'sh (o'ylab topilmaydi)");
  assert.equal(b.kind, undefined);
  assert.equal(formatSubagent(undefined).label, "");
  assert.ok(formatSubagent({ description: "x".repeat(200) }).label.length <= 60, "uzun tavsif qirqiladi");
});
test("transcript: Task tool → subagentToolStart label/kind bilan (va holatda saqlanadi)", () => {
  const { store, agent, ev } = setup();
  processTranscriptLine(store, agent, JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "tool_use", id: "t1", name: "Task", input: { description: "Review the diff", subagent_type: "code-reviewer" } }] },
  }));
  const m = ev.find((x) => x.type === "subagentToolStart") as (Msg & { label?: string; kind?: string }) | undefined;
  assert.ok(m, "subagentToolStart yuborilishi kerak");
  assert.equal(m!.label, "Review the diff");
  assert.equal(m!.kind, "code-reviewer");
  // Replay (webview qayta ochilsa) uchun holatda ham turishi shart
  assert.equal(agent.subagentToolIds.get("t1")?.kind, "code-reviewer");
  assert.ok(!agent.activeToolIds.has("t1"), "Task oddiy tool sifatida sanalmaydi");
});
test("store: sub-agent tavsifi saqlanadi, kalit bo'yicha tozalanadi", () => {
  const s = useOffice.getState();
  s.addAgent({ id: 500, folderName: "par3" });
  s.addSubagent(500, "k1", { label: "Find flaky tests", kind: "Explore" });
  s.addSubagent(500, "k1", { label: "takror" }); // bir xil kalit → qo'shilmaydi
  const subs = useOffice.getState().agents[500].subagents;
  assert.equal(subs.length, 1, "bir xil kalit ikki marta qo'shilmaydi");
  assert.equal(subs[0].kind, "Explore");
  assert.equal(subs[0].label, "Find flaky tests");
  assert.equal(useOffice.getState().agents[500].status, "collab", "yordamchi bor → collab");
  s.addSubagent(500, "k2", {}); // tavsifsiz ham bo'ladi
  assert.equal(useOffice.getState().agents[500].subagents[1].label, undefined, "bo'sh tavsif → undefined");
});

console.log("Agent nomi (qo'lda):");
test("sanitizeName: bo'shliq/qator tozalanadi, uzuni qirqiladi, bo'sh → \"\"", () => {
  assert.equal(sanitizeName("  auth  service \n"), "auth service");
  assert.equal(sanitizeName("a\tb"), "a b");
  assert.equal(sanitizeName("   "), "", "faqat bo'shliq → nom yo'q (papka nomiga qaytadi)");
  assert.equal(sanitizeName(undefined), "", "satr bo'lmasa → bo'sh");
  assert.equal(sanitizeName(42 as unknown as string), "");
  assert.ok(sanitizeName("x".repeat(100)).length <= MAX_NAME_LEN, "uzun nom qirqiladi");
});
test("store: nom berilsa displayName o'zgaradi; bo'sh nom papkaga qaytaradi", () => {
  useOffice.setState({ agents: {}, order: [], samples: [] });
  const s = useOffice.getState();
  s.addAgent({ id: 600, folderName: "monorepo", role: "backend" });
  assert.equal(displayName(useOffice.getState().agents[600]), "monorepo");
  s.setName(600, "  auth  ");
  assert.equal(useOffice.getState().agents[600].customName, "auth", "bo'shliqlar kesiladi");
  assert.equal(displayName(useOffice.getState().agents[600]), "auth");
  s.setName(600, "");
  assert.equal(useOffice.getState().agents[600].customName, undefined);
  assert.equal(displayName(useOffice.getState().agents[600]), "monorepo", "nom olib tashlandi → papka nomi");
  useOffice.setState({ agents: {}, order: [], samples: [] });
});
test("qidiruv: nom berilgan agent REPO nomi bilan ham topiladi", () => {
  const list = [{ id: 1, folderName: "auth", folderAlt: "monorepo", roleLabel: "Backend", statusLabel: "Ishlamoqda" }];
  assert.deepEqual(matchAgents(list, "auth").map((a) => a.id), [1], "yangi nom bo'yicha");
  assert.deepEqual(matchAgents(list, "monorepo").map((a) => a.id), [1], "eski (repo) nom bo'yicha ham");
});

console.log("Kesh samaradorligi:");
test("cacheStats: kesh o'qish tejaydi, yozish qimmatroq; hech narsa yo'q → nol", () => {
  // Opus: kirish $5/M, chiqish $25/M. Kesh o'qish 0.1×, yozish 1.25×.
  const s = cacheStats("claude-opus-4-8", { input: 0, cacheWrite: 0, cacheRead: 1_000_000, output: 0 });
  assert.ok(Math.abs(s.actual - 0.5) < 1e-9, "1M kesh o'qish = $0.50");
  assert.ok(Math.abs(s.naive - 5) < 1e-9, "keshsiz o'sha token $5 bo'lardi");
  assert.ok(Math.abs(s.saved - 4.5) < 1e-9, "tejam $4.50");
  assert.ok(Math.abs(s.hit - 1) < 1e-9, "hammasi keshdan → 100%");

  // Kesh yozildi, lekin O'QILMADI → tejam MANFIY (yozish 25% qimmat). Yashirmaymiz.
  const w = cacheStats("claude-opus-4-8", { input: 0, cacheWrite: 1_000_000, cacheRead: 0, output: 0 });
  assert.ok(w.saved < 0, "faqat yozilgan kesh — zarar");
  assert.equal(w.hit, 0);

  const zero = cacheStats("claude-opus-4-8", { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 });
  assert.equal(zero.hit, 0, "token yo'q → 0 (nolga bo'lish yo'q)");
  assert.equal(zero.saved, 0);

  // Aralash: yarmi keshdan
  const m = cacheStats("claude-opus-4-8", { input: 500_000, cacheWrite: 0, cacheRead: 500_000, output: 0 });
  assert.ok(Math.abs(m.hit - 0.5) < 1e-9, "yarmi keshdan → 50%");
});

console.log("Bloklanish SABABI (xato matni):");
test("formatError: satr, bloklar ro'yxati, bo'sh va uzun matn", () => {
  assert.equal(formatError("npm ERR!  404 Not Found"), "npm ERR! 404 Not Found", "bo'shliqlar normallashadi");
  assert.equal(
    formatError([{ type: "text", text: "Error:" }, { type: "text", text: "file not found" }]),
    "Error: file not found",
    "bloklar birlashtiriladi",
  );
  assert.equal(formatError(undefined), "", "mazmun yo'q → bo'sh (o'ylab topilmaydi)");
  assert.equal(formatError([]), "");
  const long = formatError("x".repeat(500));
  assert.ok(long.length <= MAX_ERROR_LEN, "uzun xato qirqiladi");
  assert.ok(long.endsWith("…"), "qirqilgani bilinib tursin");
});
test("transcript: xato natija → bloklandi + SABAB uzatiladi; toza natija → tozalanadi", () => {
  const { store, agent, ev } = setup();
  processTranscriptLine(store, agent, JSON.stringify({
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: "npm ERR! missing script: buld" }] },
  }));
  const blocked = ev.find((m) => m.type === "agentBlocked") as (Msg & { blocked?: boolean; reason?: string }) | undefined;
  assert.ok(blocked?.blocked, "bloklangan bo'lishi kerak");
  assert.equal(blocked!.reason, "npm ERR! missing script: buld", "sabab aynan xato matni");
  assert.equal(agent.blockedReason, "npm ERR! missing script: buld", "holatда saqlanadi (replay uchun)");

  ev.length = 0;
  processTranscriptLine(store, agent, JSON.stringify({
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: "t2", content: "ok" }] },
  }));
  const cleared = ev.find((m) => m.type === "agentBlocked") as (Msg & { blocked?: boolean; reason?: string }) | undefined;
  assert.equal(cleared?.blocked, false, "toza natija → blok olinadi");
  assert.equal(agent.blockedReason, undefined, "sabab ham tozalanadi");
});

console.log("Stol tartibsizligi (manba: tool chaqiruvlari):");
test("clutterLevel: yangi stol toza; chegaralarda daraja oshadi; tepasi cheklangan", () => {
  assert.equal(clutterLevel(0), 0, "sessiya boshida stol toza");
  assert.equal(clutterLevel(CLUTTER_TIERS[0] - 1), 0, "chegaraga yetmasa — o'zgarmaydi");
  assert.equal(clutterLevel(CLUTTER_TIERS[0]), 1, "aynan chegara → birinchi buyum");
  assert.equal(clutterLevel(CLUTTER_TIERS[2]), 3);
  assert.equal(clutterLevel(10_000), MAX_CLUTTER, "cheksiz o'smaydi — tepasi bor");
  // Monoton: hech qachon kamaymaydi (ish qaytmaydi)
  let prev = 0;
  for (let n = 0; n <= 100; n++) {
    const c = clutterLevel(n);
    assert.ok(c >= prev, "daraja kamaymasligi kerak");
    prev = c;
  }
});

console.log("E'tibor (status bar + tiqilib qolish):");
test("summarize + statusText: tinch holatda toza, e'tibor kerak bo'lsa nishon qo'shiladi", () => {
  const calm = summarize([
    { id: 1, permissionActive: false, blocked: false },
    { id: 2, permissionActive: false, blocked: false },
  ]);
  assert.deepEqual(calm, { total: 2, waiting: 0, blocked: 0 });
  assert.equal(statusText(calm), "$(organization) 2", "tinch holatda faqat sanoq");
  assert.equal(needsAttention(calm), false);

  const busy = summarize([
    { id: 1, permissionActive: true, blocked: false },
    { id: 2, permissionActive: false, blocked: true },
    { id: 3, permissionActive: false, blocked: false },
  ]);
  assert.deepEqual(busy, { total: 3, waiting: 1, blocked: 1 });
  assert.equal(statusText(busy), "$(organization) 3 $(bell) 1 $(error) 1");
  assert.equal(needsAttention(busy), true, "sariq fon kerak");
});
test("newlyStuck: faqat 3 daqiqadan oshganlar, va faqat BIR marta", () => {
  const now = 1_000_000;
  const since = new Map<number, number>([
    [1, now - STUCK_MS - 1000], // oshgan
    [2, now - 30_000],          // hali yosh
    [3, now - STUCK_MS],        // aynan chegara
  ]);
  const already = new Set<number>();
  const first = newlyStuck(since, already, now);
  assert.deepEqual(first.sort(), [1, 3], "chegaraga yetgan ham hisoblanadi");
  first.forEach((id) => already.add(id));
  assert.deepEqual(newlyStuck(since, already, now), [], "takroriy ogohlantirish yo'q");
});

console.log("Agent qidiruvi:");
test("matchAgents: papka nomi boshidan mos → yuqorida; rol/tool/holat ham topiladi", () => {
  const list = [
    { id: 1, folderName: "web-shop", roleLabel: "Frontend", statusLabel: "Ishlamoqda", toolLabel: "Edit cart.tsx" },
    { id: 2, folderName: "api", roleLabel: "Backend", statusLabel: "Bloklangan", toolLabel: "Bash npm test" },
    { id: 3, folderName: "shop-admin", roleLabel: "QA / Review", statusLabel: "Kutmoqda" },
  ];
  const byFolder = matchAgents(list, "shop");
  assert.equal(byFolder.length, 2, "ikkala 'shop' topilishi kerak");
  assert.equal(byFolder[0].id, 3, "nomi 'shop' bilan BOSHLANGANI yuqorida");
  assert.deepEqual(matchAgents(list, "backend").map((a) => a.id), [2], "rol bo'yicha");
  assert.deepEqual(matchAgents(list, "cart").map((a) => a.id), [1], "joriy tool bo'yicha");
  assert.deepEqual(matchAgents(list, "blok").map((a) => a.id), [2], "holat bo'yicha");
  assert.equal(matchAgents(list, "yo'q").length, 0, "mos kelmasa — bo'sh");
  assert.equal(matchAgents(list, "  ").length, 3, "bo'sh so'rov → hammasi, tartib saqlanadi");
  assert.deepEqual(matchAgents(list, "API").map((a) => a.id), [2], "registrga sezgir emas");
});

console.log("Emotsiyalar (har biri KUZATILGAN holatdan):");
test("emoteFor ustuvorligi: uchrashuv > bloklangan > kontekst > taymerli", () => {
  assert.equal(emoteFor({ meeting: "👋", status: "blocked", hot: true, timed: "🤔" }), "👋", "uchrashuv eng ustun");
  assert.equal(emoteFor({ status: "blocked", hot: true, timed: "🤔" }), "😖", "bloklangan kontekstdan ustun");
  assert.equal(emoteFor({ status: "working", hot: true, timed: "🤔" }), "🥵");
  assert.equal(emoteFor({ status: "thinking", timed: "🤔" }), "🤔");
  assert.equal(emoteFor({ status: "idle" }), "", "sababsiz emotsiya yo'q");
});
test("contextHot: 85% chegara; kontekst oynasi noma'lum → false", () => {
  assert.equal(contextHot(84_999, 100_000), false);
  assert.equal(contextHot(85_000, 100_000), true, "aynan 85% → qizigan");
  assert.equal(contextHot(999_999, 0), false, "oyna 0 → bo'lish yo'q, false");
});

console.log("Sozlamalar:");
test("sifat rejimi: tejamkor → past dpr + kamroq soya yangilanishi", () => {
  assert.equal(dprFor("high"), 1);
  assert.ok(dprFor("low") < 1, "tejamkor rejimda piksel zichligi pasayadi");
  assert.ok(shadowEvery("low") > shadowEvery("high"), "tejamkor rejimda soya kamroq yangilanadi");
});
test("toggle/reset/budjet: yaroqsiz budjet → 0 (o'chiq), reset standartga qaytaradi", () => {
  const s = useSettings.getState();
  s.setBudget(-5);
  assert.equal(useSettings.getState().budgetUsd, 0, "manfiy budjet → o'chiq");
  s.setBudget(NaN);
  assert.equal(useSettings.getState().budgetUsd, 0, "NaN → o'chiq");
  s.setBudget(7.5);
  assert.equal(useSettings.getState().budgetUsd, 7.5);

  assert.equal(useSettings.getState().showLabels, true, "yorliqlar standart holatda yoqiq");
  useSettings.getState().toggle("showLabels");
  assert.equal(useSettings.getState().showLabels, false, "toggle faqat o'sha kalitni o'zgartiradi");
  assert.equal(useSettings.getState().wander, true, "boshqa sozlamalarga tegmaydi");

  useSettings.getState().setQuality("low");
  useSettings.getState().reset();
  const r = useSettings.getState();
  assert.equal(r.showLabels, true);
  assert.equal(r.quality, "high");
  assert.equal(r.budgetUsd, 0, "reset budjetni ham o'chiradi");
});

console.log("Collision: faqat BAND o'rindiqlar to'siqlangan:");
test("band overflow stol bloklangan; BO'SH o'rindiq fantom devor yasamaydi", () => {
  setActiveSeats([0, 5, 13]); // faqat shu o'rindiqlar band
  const occupied = seatFor(13);
  assert.ok(blocked(occupied.x, occupied.z, 0.16), "band overflow stol bloklangan bo'lishi kerak");
  assert.ok(!blocked(sitPoint(occupied).x, sitPoint(occupied).z, 0.16), "sit nuqtasi ochiq");
  // Band bo'lmagan overflow o'rindiq (masalan 15) — fantom devor bo'lmasin
  const empty = seatFor(15);
  assert.ok(!blocked(empty.x, empty.z, 0.16), "BO'SH o'rindiq bloklamasligi kerak (fantom devor yo'q)");
});
test("asosiy band o'rindiq: stol bloklangan, sit ochiq", () => {
  setActiveSeats([0, 5, 9]);
  for (const i of [0, 5, 9]) {
    const s = seatFor(i);
    assert.ok(blocked(s.x, s.z, 0.16), `seat ${i} stol bloklangan`);
    assert.ok(!blocked(sitPoint(s).x, sitPoint(s).z, 0.16), `seat ${i} sit ochiq`);
  }
  setActiveSeats([]); // keyingi testlar toza boshlansin
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

// ── Nav grafi butunligi ──────────────────────────────────────
// Regressiya qalqoni: bir paytlar "glassA_d" ham startsWith("g") ga tushib,
// eshik O'ZIGA ulanib qolgan edi → 3 shisha xona grafдан uzilib, agent ichkariga
// kirib chiqolmay qolardi. Quyidagi 3 test shuni qaytadan sodir bo'lishiga
// yo'l qo'ymaydi.

const ROOM_KEYS = ["server", "kitchen", "meeting", "bathroom", "glassA", "library", "focus", "lounge", "glassB", "glassC"];

test("nav grafi: self-loop yo'q va HAMMA tugun bog'langan", () => {
  for (const [a, b] of EDGES) assert.notEqual(a, b, `self-loop qirra: ${a}`);
  const adj: Record<string, string[]> = {};
  for (const k of Object.keys(NODES)) adj[k] = [];
  for (const [a, b] of EDGES) { adj[a].push(b); adj[b].push(a); }
  const seen = new Set(["g0_0"]);
  const q = ["g0_0"];
  while (q.length) {
    const c = q.shift()!;
    for (const n of adj[c]) if (!seen.has(n)) { seen.add(n); q.push(n); }
  }
  const missing = Object.keys(NODES).filter((k) => !seen.has(k));
  assert.deepEqual(missing, [], `yetib bo'lmaydigan tugunlar: ${missing.join(", ")}`);
});

test("nav grafi: har qirra to'siqsiz (bo'sh ofis + hamma o'rindiq band)", () => {
  const RAD = 0.16; // AgentAvatar personaj radiusi
  const badEdges = (): string[] => {
    const bad: string[] = [];
    for (const [a, b] of EDGES) {
      const A = NODES[a], B = NODES[b];
      const d = Math.hypot(B.x - A.x, B.z - A.z);
      const steps = Math.max(2, Math.ceil(d / 0.08));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (blocked(A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t, RAD)) { bad.push(`${a}→${b}`); break; }
      }
    }
    return bad;
  };
  setActiveSeats([]);
  assert.deepEqual(badEdges(), [], "bo'sh ofisda bloklangan qirra bo'lmasligi kerak");
  setActiveSeats([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(badEdges(), [], "o'rindiqlar band bo'lganda ham bloklangan qirra bo'lmasligi kerak");
  setActiveSeats([]);
});

test("nav: har xonaga kirish VA undan chiqish yo'li bor", () => {
  for (const key of ROOM_KEYS) {
    assert.ok(pathBetween("g2_1", `${key}_i`).length > 0, `${key} ichkarisiga yo'l bo'lishi kerak`);
    assert.ok(pathBetween(`${key}_i`, "g2_1").length > 0, `${key} ichidan CHIQISH yo'li bo'lishi kerak`);
  }
});

// ── Ijtimoiy hayot (uchrashuv) ───────────────────────────────
test("presence: ikki bo'sh agent bitta hub'ga juftlanadi (faqat kichik id tashabbus)", () => {
  presenceReset();
  report(1, -5, -3, true);
  report(2, -5, 0, true);
  const m1 = seekMeeting(1, -5, -3, 0);
  assert.ok(m1, "kichik id (1) uchrashuv yaratishi kerak");
  const m2 = meetingOf(2);
  assert.ok(m2, "sherik (2) ga ham yozilishi kerak");
  assert.equal(m1!.point, m2!.point, "ikkovi bir xil hub'ga borishi kerak");
  assert.ok(NODES[m1!.point], "hub haqiqiy nav tuguni bo'lishi kerak");

  presenceReset();
  report(1, -5, -3, true);
  report(2, -5, 0, true);
  assert.equal(seekMeeting(2, -5, 0, 0), null, "katta id tashabbus qilmasligi kerak");
});

test("presence: band (busy) agent uchrashuvga tanlanmaydi", () => {
  presenceReset();
  report(1, -5, -3, true);
  report(2, -5, 0, false); // band
  assert.equal(seekMeeting(1, -5, -3, 0), null, "yagona sherik band bo'lsa uchrashuv yo'q");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
