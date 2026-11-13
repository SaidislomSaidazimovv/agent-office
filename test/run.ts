import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AgentManager } from "../extension/vscode/agentManager.js";
import { AgentStateStore } from "../extension/server/agentStateStore.js";
import { FileWatcher } from "../extension/server/fileWatcher.js";
import { areHooksInstalled, decideHookInstall, findOnPath, hasOurHooks, installHooks, installStableHookScript, uninstallHooks } from "../extension/vscode/hookInstaller.js";
import { handleHookEvent } from "../extension/server/hookHandler.js";
import { pickServerForCwd, type ServerEntry, within } from "../extension/core/hookRouting.js";
import { HistoryStore, recordFromAgents } from "../extension/vscode/historyStore.js";
import { buildWebviewHtml, webviewCsp } from "../extension/vscode/webviewHtml.js";
import { slimHookPayload } from "../extension/core/hookPayload.js";
import { trustedTranscriptPath } from "../extension/core/paths.js";
import { processTranscriptLine } from "../extension/server/transcriptParser.js";
import { isStaleExternal, MAX_NAME_LEN, needsAttention, newlyStuck, sanitizeName, STALE_IDLE_MS, statusText, STUCK_MS, summarize } from "../extension/core/attention.js";
import { getSessionDir } from "../extension/core/paths.js";
import { agentSnapshotMessages, formatError, formatSubagent, MAX_ERROR_LEN, permissionDelayFor } from "../extension/server/stateActions.js";
import { createAgentState } from "../extension/server/types.js";
import { budgetCrossing, budgetState } from "../webview-ui/src/budget.js";
import { agentEfficiency, costVelocity, timeToBudgetMin } from "../webview-ui/src/forecast.js";
import { buildReport } from "../webview-ui/src/report.js";
import { buildReportHtml } from "../webview-ui/src/reportHtml.js";
import { cacheStats, estimateCost } from "../webview-ui/src/pricing.js";
import { messageCost } from "../extension/core/pricing.js";
import { matchAgents } from "../webview-ui/src/search.js";
import { buildStory, storyMarkdown, toolCat } from "../webview-ui/src/story.js";
import { dailyCost, dayStatFor, historyCsv, modelTotals, projectTotals, rollupCost } from "../webview-ui/src/history.js";
import { buildInsights, editedFile, fileConflicts } from "../webview-ui/src/insights.js";
import type { AgentView as AgentViewT } from "../webview-ui/src/store.js";
import { dprFor, shadowEvery, useSettings } from "../webview-ui/src/settings.js";
import { EDGES, NODES, nearestNode, pathBetween } from "../webview-ui/src/scene/nav.js";
import { blocked, setActiveSeats } from "../webview-ui/src/scene/collision.js";
import { CLUTTER_TIERS, clutterLevel, MAX_CLUTTER } from "../webview-ui/src/scene/clutter.js";
import { contextHot, emoteFor } from "../webview-ui/src/scene/emotes.js";
import { _reset as presenceReset, meetingOf, report, seekMeeting } from "../webview-ui/src/scene/presence.js";
import { characterFor, seatFor, sitPoint } from "../webview-ui/src/scene/roles.js";
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

test("bir xil message.id'li qatorlar (har content-block alohida) usage'ni BIR MARTA hisoblaydi", () => {
  // Haqiqiy Claude Code transkripti: bitta API javobi thinking/text/tool_use
  // bloklari uchun 3 qatorga bo'linadi, har birida AYNAN bir xil usage.
  const { store, agent } = setup();
  const usage = { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200, output_tokens: 300 };
  const line = (block: unknown) => JSON.stringify({ type: "assistant", requestId: "req_1", message: { id: "msg_A", model: "claude-opus-4-8", content: [block], usage } });
  processTranscriptLine(store, agent, line({ type: "thinking", thinking: "..." }));
  processTranscriptLine(store, agent, line({ type: "text", text: "ok" }));
  processTranscriptLine(store, agent, line({ type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } }));
  assert.equal(agent.outputTokens, 300, "output bir marta");
  assert.equal(agent.billedInput, 10);
  assert.equal(agent.billedCacheRead, 1000);
  assert.equal(agent.billedCacheWrite, 200);
  assert.ok(agent.activeToolIds.has("t1"), "tool bloki baribir qayta ishlanadi");
  // Keyingi (boshqa id'li) xabar — qo'shiladi.
  processTranscriptLine(store, agent, JSON.stringify({ type: "assistant", message: { id: "msg_B", content: [{ type: "text", text: "x" }], usage: { input_tokens: 1, output_tokens: 5 } } }));
  assert.equal(agent.outputTokens, 305);
  assert.equal(agent.billedInput, 11);
});

test("narx: rasmiy jadval (2026-11-13) — har toifa, eski/sanali id'lar, kesh o'qish ko'paytuvchisi modelga bog'liq", () => {
  const M = 1_000_000;
  const near = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`);
  // Opus 5.5: $4 / $5 (5m) / $8 (1h) / $0.20 (o'qish) / $20.
  near(messageCost("claude-opus-5-5", { input_tokens: M }), 4, "opus-5-5 input");
  near(messageCost("claude-opus-5-5", { cache_creation_input_tokens: M }), 5, "5m yozish (bo'linish yo'q → 5m)");
  near(messageCost("claude-opus-5-5", { cache_creation_input_tokens: M, cache_creation: { ephemeral_1h_input_tokens: M } }), 8, "1h yozish");
  near(messageCost("claude-opus-5-5", { cache_read_input_tokens: M }), 0.2, "opus-5-5 o'qish 0.05×");
  near(messageCost("claude-opus-5-5", { output_tokens: M }), 20, "opus-5-5 output");
  // Kesh o'qish ko'paytuvchilari (sahifadagi ustun bilan bir xil).
  near(messageCost("claude-fable-5-2", { cache_read_input_tokens: M }), 0.2, "fable-5-2 0.025×");
  near(messageCost("claude-fable-5-1", { cache_read_input_tokens: M }), 0.25, "fable-5-1");
  near(messageCost("claude-fable-5", { cache_read_input_tokens: M }), 1, "fable-5 0.1×");
  near(messageCost("claude-sonnet-5-5", { cache_read_input_tokens: M }), 0.1, "sonnet-5-5");
  near(messageCost("claude-sonnet-5", { cache_read_input_tokens: M }), 0.2, "sonnet-5");
  near(messageCost("claude-opus-4-8[1m]", { input_tokens: M, cache_read_input_tokens: M }), 5.5, "opus-4-8 [1m]");
  // Eski va sanali id'lar.
  near(messageCost("claude-opus-4-5-20251101", { input_tokens: M }), 5, "opus-4-5 sanali");
  near(messageCost("claude-opus-4-1-20250805", { input_tokens: M, output_tokens: M }), 90, "opus-4-1 $15/$75");
  near(messageCost("claude-opus-4-20250514", { input_tokens: M }), 15, "opus-4 sanali");
  near(messageCost("claude-sonnet-4-5-20250929", { input_tokens: M, output_tokens: M }), 18, "sonnet-4-5 $3/$15");
  near(messageCost("claude-haiku-4-5-20251001", { input_tokens: M, output_tokens: M }), 6, "haiku-4-5 $1/$5");
  // Fast mode — kesh ko'paytuvchisi fast narx USTIGA; fast'i yo'q modelda e'tiborsiz.
  near(messageCost("claude-opus-5-5", { input_tokens: M, cache_read_input_tokens: M, speed: "fast" }), 8.4, "opus-5-5 fast");
  near(messageCost("claude-fable-5-2", { output_tokens: M, speed: "fast" }), 80, "fable-5-2 fast output");
  near(messageCost("claude-sonnet-5-5", { input_tokens: M, speed: "fast" }), 2, "fast'i yo'q model — standart");
  // Haiku 5.5: prompt (input+o'qish+yozish) 100k dan oshsa — har so'rov yuqori narxda.
  near(messageCost("claude-haiku-5-5", { input_tokens: 50_000, cache_read_input_tokens: 40_000, output_tokens: 1000 }), (50_000 * 0.1 + 40_000 * 0.01 + 1000 * 0.5) / M, "haiku-5-5 ≤100k");
  near(messageCost("claude-haiku-5-5", { input_tokens: 90_000, cache_read_input_tokens: 20_000, output_tokens: 1000 }), (90_000 * 0.5 + 20_000 * 0.05 + 1000 * 2.5) / M, "haiku-5-5 >100k");
  // US-inference ×1.1, web search $10/1000.
  near(messageCost("claude-opus-5-5", { input_tokens: M, inference_geo: "us" }), 4.4, "inference_geo us");
  near(messageCost("claude-opus-5-5", { server_tool_use: { web_search_requests: 3 } }), 0.03, "web search");
  // Webview zaxira taxmini AYNAN shu jadvaldan foydalanadi (bitta manba).
  near(estimateCost("claude-opus-5-5", { input: 0, cacheWrite: 0, cacheRead: M, output: 0 }), 0.2, "webview zaxira = host jadvali");
});

test("host xarajati javob bo'yicha hisoblanadi (har javob o'z modeli) va agentTokenUsage'da yuboriladi", () => {
  const { store, agent, ev } = setup();
  const msg = (id: string, model: string, usage: Record<string, unknown>) =>
    JSON.stringify({ type: "assistant", message: { id, model, content: [{ type: "text", text: "x" }], usage } });
  processTranscriptLine(store, agent, msg("a", "claude-opus-5-5", { input_tokens: 1_000_000 }));
  processTranscriptLine(store, agent, msg("a", "claude-opus-5-5", { input_tokens: 1_000_000 })); // dublikat qator
  processTranscriptLine(store, agent, msg("b", "claude-haiku-4-5", { output_tokens: 1_000_000 }));
  assert.ok(Math.abs(agent.costUsd - 9) < 1e-9, `4 (opus) + 5 (haiku) = 9, ${agent.costUsd}`);
  const last = [...ev].reverse().find((e) => e.type === "agentTokenUsage") as { costUsd?: number };
  assert.ok(Math.abs((last.costUsd ?? 0) - 9) < 1e-9, "costUsd broadcast qilinadi");
});

test("sub-agent transkriptlari (<sessiya>/subagents/*.jsonl) xarajatga qo'shiladi — dedupe, o'z modeli, jonli", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ao-sub-"));
  const main = path.join(dir, "sess1.jsonl");
  const subDir = path.join(dir, "sess1", "subagents");
  fs.mkdirSync(subDir, { recursive: true });
  const line = (id: string, model: string, usage: Record<string, number>) =>
    JSON.stringify({ type: "assistant", isSidechain: true, message: { id, model, content: [{ type: "text", text: "x" }], usage } });
  fs.writeFileSync(main, line("m1", "claude-opus-5-5", { input_tokens: 1_000_000 }) + "\n"); // $4
  const subA = path.join(subDir, "agent-a.jsonl");
  const s1 = line("s1", "claude-haiku-4-5", { output_tokens: 1_000_000 }); // $5
  fs.writeFileSync(subA, `${s1}\n${s1}\n`); // dublikat qator
  const store = new AgentStateStore();
  const watcher = new FileWatcher(store);
  const agent = createAgentState(1, main, "p", { sessionId: "sess1" });
  watcher.primeAndAdd(agent, () => store.add(agent));
  assert.ok(Math.abs(agent.costUsd - 9) < 1e-9, `asosiy $4 + sub-agent $5 = $9, ${agent.costUsd}`);
  assert.ok(Math.abs((agent.subagentCostUsd ?? 0) - 5) < 1e-9);
  assert.equal(agent.outputTokens, 0, "sub-agent tokenlari asosiy kontekst/output'ga aralashmaydi");
  // Jonli: yangi sub-agent fayli paydo bo'ladi → tick xarajatni oshiradi va yuboradi.
  const ev: { type: string; costUsd?: number }[] = [];
  store.on("broadcast", (m: { type: string; costUsd?: number }) => ev.push(m));
  fs.writeFileSync(path.join(subDir, "agent-b.jsonl"), line("s2", "claude-sonnet-5-5", { input_tokens: 1_000_000 }) + "\n"); // $2
  (watcher as unknown as { tick(): void }).tick();
  assert.ok(Math.abs(agent.costUsd - 11) < 1e-9, `+ $2 = $11, ${agent.costUsd}`);
  assert.ok(ev.some((e) => e.type === "agentTokenUsage" && Math.abs((e.costUsd ?? 0) - 11) < 1e-9), "yangilanish yuborildi");
  // Qayta o'qish (/clear·/resume yo'li) — ikki barobar emas.
  watcher.primeFromStart(agent);
  assert.ok(Math.abs(agent.costUsd - 11) < 1e-9, `qayta o'qishda ham $11, ${agent.costUsd}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("primeFromStart qayta o'qishda dedupe 0dan boshlanadi (xarajat yo'qolmaydi)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ao-dedupe-"));
  const file = path.join(dir, "s.jsonl");
  const l = JSON.stringify({ type: "assistant", message: { id: "msg_A", content: [{ type: "text", text: "x" }], usage: { input_tokens: 7, output_tokens: 9 } } });
  fs.writeFileSync(file, `${l}\n${l}\n`);
  const store = new AgentStateStore();
  const watcher = new FileWatcher(store);
  const agent = createAgentState(1, file, "proj", { sessionId: "s" });
  watcher.primeFromStart(agent);
  assert.equal(agent.outputTokens, 9);
  watcher.primeFromStart(agent); // /clear·/resume·truncate yo'li
  assert.equal(agent.outputTokens, 9, "ikkinchi o'qishda ham to'g'ri (0 emas, 18 emas)");
  fs.rmSync(dir, { recursive: true, force: true });
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

console.log("Webview HTML (CSP):");

test("webview HTML: qat'iy CSP <head> boshida, tashqi tarmoq yo'q, skriptlar nonce'li", () => {
  const src = '<!doctype html><html><head><meta charset="UTF-8" /><style>a{}</style><script type="module" crossorigin src="./assets/index.js"></script><link rel="modulepreload" crossorigin href="./assets/three.js"></head><body></body></html>';
  const out = buildWebviewHtml(src, { toUri: (f) => `https://res.test/${f}`, cspSource: "https://res.test", nonce: "N1", assetBase: "https://res.test/" });
  const headStart = out.indexOf("<head>") + "<head>".length;
  assert.ok(out.startsWith('<meta http-equiv="Content-Security-Policy"', headStart), "CSP birinchi element");
  assert.ok(out.includes('src="https://res.test/assets/index.js"'), "asset URL webview URI'ga aylandi");
  assert.ok(out.includes('href="https://res.test/assets/three.js"'));
  const scripts = out.match(/<script\b[^>]*>/g) || [];
  assert.equal(scripts.length, 2);
  assert.ok(scripts.every((t) => t.includes('nonce="N1"')), "har skript nonce'li");
  const csp = webviewCsp("https://res.test", "N1");
  assert.ok(csp.startsWith("default-src 'none'"));
  assert.ok(!/\*|https?:\/\/(?!res\.test)/.test(csp.replace(/'[^']*'/g, "")), "faqat o'z manbamiz — wildcard/tashqi host yo'q");
  assert.ok(!csp.includes("unsafe-eval") && !/script-src[^;]*unsafe-inline/.test(csp), "skriptda unsafe-inline/eval yo'q");
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

test("tool_use_id: bir xil imzoli parallel toollar ANIQ id bo'yicha yopiladi", () => {
  const { store, agent } = setup();
  const pre = (id: string) => handleHookEvent(store, agent, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test" }, tool_use_id: id });
  pre("toolu_A");
  pre("toolu_B");
  assert.deepEqual([...agent.activeToolIds].sort(), ["hook-toolu_A", "hook-toolu_B"]);
  handleHookEvent(store, agent, { hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "npm test" }, tool_use_id: "toolu_B" });
  assert.deepEqual([...agent.activeToolIds], ["hook-toolu_A"], "faqat B yopildi");
});

test("PostToolUseFailure → bloklandi (error sababi bilan); is_interrupt → bloklanMAYDI", () => {
  const { store, agent } = setup();
  handleHookEvent(store, agent, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm i" }, tool_use_id: "t1" });
  handleHookEvent(store, agent, { hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "npm i" }, tool_use_id: "t1", error: "Exit code 1\nError: Cannot find module 'express'" });
  assert.equal(agent.blocked, true);
  assert.ok(agent.blockedReason?.includes("Cannot find module"), "sabab error maydonidan");
  assert.equal(agent.activeToolIds.size, 0, "xato bergan tool osilib qolmaydi");
  const b = setup();
  handleHookEvent(b.store, b.agent, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "sleep 9" }, tool_use_id: "t2" });
  handleHookEvent(b.store, b.agent, { hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "sleep 9" }, tool_use_id: "t2", error: "Interrupted", is_interrupt: true });
  assert.equal(b.agent.blocked, false, "foydalanuvchi to'xtatgani — xato emas");
  assert.equal(b.agent.activeToolIds.size, 0);
});

test("Notification notification_type: permission_prompt / idle_prompt; noma'lum tur e'tiborsiz", () => {
  const a = setup();
  handleHookEvent(a.store, a.agent, { hook_event_name: "Notification", notification_type: "permission_prompt", message: "Claude needs your permission" });
  assert.ok(a.ev.some((e) => e.type === "agentToolPermission"));
  const b = setup();
  handleHookEvent(b.store, b.agent, { hook_event_name: "Notification", notification_type: "idle_prompt", message: "Claude is waiting for your input" });
  assert.ok(b.ev.some((e) => e.type === "agentStatus" && e.awaitingInput === true));
  const c = setup();
  // Turi berilgan, lekin bizga noma'lum — matnida "permission" bo'lsa ham holat yasamaymiz.
  handleHookEvent(c.store, c.agent, { hook_event_name: "Notification", notification_type: "auth_success", message: "permission granted" });
  assert.ok(!c.ev.some((e) => e.type === "agentToolPermission" || (e.type === "agentStatus" && e.status === "waiting")));
});

test("SubagentStop: parallel sub-agentlar qolgan; yagona bo'lsa yopiladi", () => {
  const { store, agent } = setup();
  const task = (id: string, d: string) => handleHookEvent(store, agent, { hook_event_name: "PreToolUse", tool_name: "Task", tool_input: { description: d, prompt: "p" }, tool_use_id: id });
  task("s1", "A");
  task("s2", "B");
  handleHookEvent(store, agent, { hook_event_name: "SubagentStop", agent_id: "agent-x" });
  assert.equal(agent.subagentToolIds.size, 2, "qaysi biri tugagani noma'lum — ikkalasi ham qoladi");
  handleHookEvent(store, agent, { hook_event_name: "PostToolUse", tool_name: "Task", tool_input: { description: "A", prompt: "p" }, tool_use_id: "s1" });
  assert.deepEqual([...agent.subagentToolIds.keys()], ["hook-s2"], "Task PostToolUse aniq yopadi");
  handleHookEvent(store, agent, { hook_event_name: "SubagentStop", agent_id: "agent-y" });
  assert.equal(agent.subagentToolIds.size, 0, "yagona qolgan — yopiladi");
});

test("hook payload ixchamlashtiriladi: natija/so'rov/javob matni tashlanadi, uzun satrlar qisqaradi", () => {
  const big = "x".repeat(50_000);
  const raw = {
    session_id: "s", cwd: "/p", hook_event_name: "PostToolUse", tool_name: "Write", tool_use_id: "t",
    tool_input: { file_path: "/p/a.ts", content: big }, tool_response: { content: big },
    prompt: "secret prompt", last_assistant_message: "reply text", transcript_path: "/h/.claude/projects/p/s.jsonl",
  };
  const out = slimHookPayload(raw);
  assert.equal(out.tool_response, undefined);
  assert.equal(out.prompt, undefined);
  assert.equal(out.last_assistant_message, undefined);
  assert.equal(out.transcript_path, raw.transcript_path);
  const ti = out.tool_input as { file_path: string; content: string };
  assert.equal(ti.file_path, "/p/a.ts");
  assert.ok(ti.content.length < 2100 && ti.content.endsWith("…[50000]"));
  assert.ok(JSON.stringify(out).length < 3000);
  assert.deepEqual(slimHookPayload(raw), out, "deterministik (Pre/Post imzosi mos)");
});

test("trustedTranscriptPath: faqat ~/.claude/projects ichidagi mutlaq .jsonl", () => {
  const root = path.join(os.homedir(), ".claude", "projects");
  const ok = path.join(root, "proj", "abc.jsonl");
  assert.equal(trustedTranscriptPath(ok), path.resolve(ok));
  assert.equal(trustedTranscriptPath(path.join(os.homedir(), "evil.jsonl")), undefined, "ildizdan tashqarida");
  assert.equal(trustedTranscriptPath(path.join(root, "..", "x.jsonl")), undefined, "../ bilan chiqib ketish");
  assert.equal(trustedTranscriptPath(path.join(root, "proj", "abc.txt")), undefined);
  assert.equal(trustedTranscriptPath("relative/abc.jsonl"), undefined);
  assert.equal(trustedTranscriptPath(42), undefined);
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
  const watcher = { primeFromStart() {}, emitSnapshot() {}, primeAndAdd(_a: unknown, add: () => void) { add(); }, reprime() {} } as unknown as import("../extension/server/fileWatcher.js").FileWatcher;
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

test("barqaror hook-skript: nusxalanadi, takror chaqiruv o'zgartirmaydi; eski versiya yo'li ko'chiriladi", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ao-stable-"));
  const src = path.join(dir, "ext-0.1.6", "dist", "hooks", "claude-hook.js");
  fs.mkdirSync(path.dirname(src), { recursive: true });
  fs.writeFileSync(src, "// v1");
  const dest = path.join(dir, "home", ".agent-office", "hooks", "claude-hook.js");
  assert.equal(installStableHookScript(src, dest), dest);
  assert.equal(fs.readFileSync(dest, "utf8"), "// v1");
  const m1 = fs.statSync(dest).mtimeMs;
  assert.equal(installStableHookScript(src, dest), dest, "o'zgarmagan — qayta yozmaydi");
  assert.equal(fs.statSync(dest).mtimeMs, m1);
  fs.writeFileSync(src, "// v2");
  installStableHookScript(src, dest);
  assert.equal(fs.readFileSync(dest, "utf8"), "// v2", "yangi versiya nusxalanadi");
  assert.equal(installStableHookScript(path.join(dir, "yoq.js"), dest), undefined, "manba yo'q → undefined (zaxira)");
  // Eski (versiyali) yo'l bilan o'rnatilgan → barqaror yo'lga ko'chadi, dublikatsiz.
  const f = path.join(dir, "settings.json");
  installHooks(src, f);
  assert.equal(hasOurHooks(f), true);
  installHooks(dest, f);
  const cmds = Object.values(JSON.parse(fs.readFileSync(f, "utf8")).hooks as Record<string, { hooks: { command: string }[] }[]>).flat().flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(cmds.every((c) => c.includes(dest)), "faqat barqaror yo'l qoladi");
  uninstallHooks("", f);
  assert.equal(hasOurHooks(f), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("hook qarori: mavjud foydalanuvchi o'zgarishsiz; yangisidan rozilik; rad/Uninstall hurmat qilinadi; node yo'q → yozilmaydi", () => {
  // Mavjud o'rnatish (hozirgi foydalanuvchilar) — hech narsa so'ralmaydi, yangilanadi.
  assert.equal(decideHookInstall({ alreadyInstalled: true, consent: undefined, nodeFound: true }), "install");
  assert.equal(decideHookInstall({ alreadyInstalled: true, consent: undefined, nodeFound: false }), "install", "ishlab turgan o'rnatishni buzmaymiz");
  // Yangi o'rnatish — so'raymiz.
  assert.equal(decideHookInstall({ alreadyInstalled: false, consent: undefined, nodeFound: true }), "ask");
  assert.equal(decideHookInstall({ alreadyInstalled: false, consent: "granted", nodeFound: true }), "install");
  // Rad etilgan / Uninstall bosilgan — qayta yozmaymiz.
  assert.equal(decideHookInstall({ alreadyInstalled: false, consent: "declined", nodeFound: true }), "skip-declined");
  // node yo'q — so'ramaymiz ham, yozmaymiz ham (har tool'da hook xatosi bo'lardi).
  assert.equal(decideHookInstall({ alreadyInstalled: false, consent: undefined, nodeFound: false }), "skip-no-node");
  assert.equal(decideHookInstall({ alreadyInstalled: false, consent: "granted", nodeFound: false }), "skip-no-node");
});

test("findOnPath: PATH'dagi node topiladi (fs, child_process yo'q); yo'q bo'lsa undefined", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ao-path-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "node"), "");
  fs.writeFileSync(path.join(bin, "node.exe"), "");
  // Ajratgich platformaga bog'liq (win32 ";" — drayv harfidagi ":" bilan to'qnashmaydi).
  if (process.platform === "win32") {
    assert.equal(findOnPath("node", { Path: `C:\\yoq;${bin}`, PATHEXT: ".COM;.EXE" }, "win32"), path.join(bin, "node.exe"));
  } else {
    assert.equal(findOnPath("node", { PATH: `/yoq:${bin}` }, "linux"), path.join(bin, "node"));
  }
  assert.equal(findOnPath("node", { PATH: "/yoq" }, "linux"), undefined);
  assert.equal(findOnPath("node", {}, "linux"), undefined);
  fs.rmSync(dir, { recursive: true, force: true });
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
test("runInBackground: fon bayrog'i ushlab turiladi, agent bo'shaganда tozalanadi", () => {
  const s = useOffice.getState();
  s.addAgent({ id: 410, folderName: "bg" });
  s.setTool(410, "Bash", "Bash npm run dev", true); // fonda ishga tushdi
  assert.equal(useOffice.getState().agents[410].background, true, "fon bayrog'i yonishi kerak");
  s.toolDone(410); // fon tool CHAQIRUVI tugadi — bayroq o'chmasin
  assert.equal(useOffice.getState().agents[410].background, true, "toolDone bayroqni o'chirmasligi kerak");
  s.setTool(410, "Edit", "Edit x.ts"); // oldinги (foreground) ish — ushlab qoladi
  assert.equal(useOffice.getState().agents[410].background, true, "foreground tool bayroqni ushlab qolishi kerak");
  s.setActive(410, false); // agent bo'shadi — burst tugadi
  assert.equal(useOffice.getState().agents[410].background, false, "bo'shaganda tozalanishi kerak");
});
test("setPermissionMode: bypass rejimi saqlanadi (xavfsizlik belgisi uchun)", () => {
  const s = useOffice.getState();
  s.addAgent({ id: 420, folderName: "bp" });
  assert.equal(useOffice.getState().agents[420].permissionMode, undefined, "boshda aniqlanmagan bo'lishi kerak");
  s.setPermissionMode(420, "bypassPermissions");
  assert.equal(useOffice.getState().agents[420].permissionMode, "bypassPermissions", "bypass saqlanishi kerak");
});
test("addAgent: isExternal saqlanadi (tashqi/ichki origin belgisi uchun)", () => {
  const s = useOffice.getState();
  s.addAgent({ id: 430, folderName: "ext", isExternal: true });
  s.addAgent({ id: 431, folderName: "int", isExternal: false });
  assert.equal(useOffice.getState().agents[430].isExternal, true, "tashqi saqlanishi kerak");
  assert.equal(useOffice.getState().agents[431].isExternal, false, "ichki saqlanishi kerak");
});
test("setGitRepos: staged/unstaged/ahead/behind saqlanadi (boyroq git)", () => {
  const s = useOffice.getState();
  s.setGitRepos([{ name: "repo", branch: "main", changed: 5, staged: 2, unstaged: 3, ahead: 1, behind: 4 }]);
  const g = useOffice.getState().gitRepos["repo"];
  assert.equal(g.staged, 2, "staged saqlanishi kerak");
  assert.equal(g.unstaged, 3, "unstaged saqlanishi kerak");
  assert.equal(g.ahead, 1, "ahead saqlanishi kerak");
  assert.equal(g.behind, 4, "behind saqlanishi kerak");
});
test("setRole: qo'lda rol o'rnatiladi; bo'sh '' → avtomatikka (undefined) qaytadi", () => {
  const s = useOffice.getState();
  s.addAgent({ id: 440, folderName: "r" });
  s.setRole(440, "backend");
  assert.equal(useOffice.getState().agents[440].role, "backend", "qo'lda rol o'rnatilishi kerak");
  s.setRole(440, "");
  assert.equal(useOffice.getState().agents[440].role, undefined, "'' → avtomatik (undefined)");
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
test("budgetCrossing: chegaradan o'tishда BIR marta fire, gisterezis bilan qayta tiklanadi", () => {
  assert.deepEqual(budgetCrossing(0.5, 1, false), { fire: false, notified: false }, "budjet ostida — xabar yo'q");
  assert.deepEqual(budgetCrossing(1, 1, false), { fire: true, notified: true }, "o'tishда fire=true");
  assert.deepEqual(budgetCrossing(1.5, 1, true), { fire: false, notified: true }, "hali oshgan, avval xabar berilган — qayta fire yo'q");
  // budjet ko'tarilди (sarf endi <95% limit) → qayta tiklanadi
  assert.deepEqual(budgetCrossing(1.5, 2, true), { fire: false, notified: false }, "budjet ko'tarilди → reset");
  assert.deepEqual(budgetCrossing(2, 2, false), { fire: true, notified: true }, "yangi o'tishда yana fire");
  assert.deepEqual(budgetCrossing(5, 0, false), { fire: false, notified: false }, "budjet o'chiq (0) → hech qachon fire");
});
test("forecast: costVelocity — so'nggi oynada $/daqiqa; kam namuna → 0", () => {
  const s = (t: number, cost: number) => ({ t, cost, inTok: 0, outTok: 0, active: 0 });
  const samples = [s(0, 0), s(60000, 0.5), s(120000, 1), s(180000, 1.5), s(240000, 2), s(300000, 2.5)];
  assert.ok(Math.abs(costVelocity(samples) - 0.5) < 1e-6, "5 daqiqada $2.5 → 0.5 $/daqiqa");
  assert.equal(costVelocity([]), 0, "namuna yo'q → 0");
  assert.equal(costVelocity([s(0, 1)]), 0, "bitta namuna → 0");
});
test("forecast: timeToBudgetMin — qolgan daqiqa; budjet/tezlik yo'q → null", () => {
  assert.equal(timeToBudgetMin(2, 0.5, 5), 6, "(5-2)/0.5 = 6 daqiqa");
  assert.equal(timeToBudgetMin(5, 0.5, 5), 0, "allaqachon oshgan → 0");
  assert.equal(timeToBudgetMin(2, 0.5, 0), null, "budjet yo'q → null");
  assert.equal(timeToBudgetMin(2, 0, 5), null, "tezlik 0 → null");
});
test("forecast: agentEfficiency — cost/tool, token/turn, faol ulush; bo'luvchi 0 → 0", () => {
  const e = agentEfficiency({ costUsd: 1.2, toolCalls: 4, turns: 3, inputTokens: 120, outputTokens: 30, activity: [1, 1, 0, 0] });
  assert.ok(Math.abs(e.costPerTool - 0.3) < 1e-9, "1.2/4 = 0.3");
  assert.ok(Math.abs(e.tokensPerTurn - 50) < 1e-9, "(120+30)/3 = 50");
  assert.ok(Math.abs(e.activeRatio - 0.5) < 1e-9, "2/4 faol = 0.5");
  const z = agentEfficiency({ costUsd: 1, toolCalls: 0, turns: 0, inputTokens: 10, outputTokens: 0, activity: [] });
  assert.equal(z.costPerTool, 0, "tool 0 → 0");
  assert.equal(z.tokensPerTurn, 0, "turn 0 → 0");
  assert.equal(z.activeRatio, 0, "activity yo'q → 0");
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
test("buildReportHtml: mustaqil HTML hujjat, XSS-escaping, jami/model/budjet", () => {
  useOffice.setState({ agents: {}, order: [], samples: [] });
  const s = useOffice.getState();
  s.addAgent({ id: 500, folderName: "a<b>", role: "frontend" }); // < > → escaping (XSS emas)
  const a0 = useOffice.getState().agents;
  useOffice.setState({ agents: { 500: { ...a0[500], costUsd: 3, inputTokens: 20000, outputTokens: 2000, toolCalls: 7, turns: 2, activeMs: 65000, model: "claude-opus-4-8" } } });
  const st = useOffice.getState();
  const html = buildReportHtml({ agents: st.order.map((id) => st.agents[id]), now: 1_700_000_000_000, budgetUsd: 5, t: (k) => k });
  assert.ok(html.startsWith("<!doctype html>"), "to'liq HTML hujjat");
  assert.ok(html.includes("<style>") && html.includes("</html>"), "inline uslub + yopiq hujjat");
  assert.ok(!html.includes("http://") && !html.includes("https://"), "TASHQI resurs yo'q (offline/CSP-safe)");
  assert.ok(html.includes("a&lt;b&gt;"), "folderName ichidagi < > ekranlanishi kerak");
  assert.ok(!html.includes("a<b>"), "xom < > qolmasligi kerak (XSS emas)");
  assert.ok(html.includes("~$3.00"), "jami xarajat");
  assert.ok(html.includes("Opus 4.8"), "model qisqa nom");
  assert.ok(html.includes("$3.00 / $5.00"), "budjet qatori");
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

function baseAgent(id: number, folder: string): AgentViewT {
  return {
    id, folderName: folder, isExternal: false, seatIndex: 0,
    active: false, awaitingInput: false, permission: false, blocked: false, stuck: false, reading: false,
    activeToolCount: 0, subagents: [], inputTokens: 0, outputTokens: 0, contextWindow: 200000,
    costUsd: 0, billed: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 },
    toolCalls: 0, turns: 0, activeMs: 0, activeSince: null, toolHistory: [], status: "idle",
  };
}
console.log("Xulosalar (deterministik zukkolik):");
test("editedFile: tahrir toolidan fayl; boshqa tool → null", () => {
  assert.equal(editedFile("Edit store.ts"), "store.ts");
  assert.equal(editedFile("Write README.md"), "README.md");
  assert.equal(editedFile("Read store.ts"), null, "o'qish tahrir emas");
  assert.equal(editedFile("Bash npm test"), null);
});
test("buildInsights: bir repoда bir faylni 2 agent tahrirlasa → to'qnashuv", () => {
  const withHist = (id: number, folder: string, labels: string[]) => ({
    ...baseAgent(id, folder), toolHistory: labels.map((l, i) => ({ label: l, at: i })),
  });
  const ins = buildInsights([
    withHist(1, "repo", ["Edit store.ts", "Read a.ts"]),
    withHist(2, "repo", ["Edit store.ts", "Edit b.ts"]),
    withHist(3, "repo", ["Edit other.ts"]),
  ], [], Date.now());
  const conflict = ins.find((i) => i.key === "insight.conflict");
  assert.ok(conflict, "to'qnashuv aniqlanishi kerak");
  assert.equal(conflict!.vars!.file, "store.ts");
  assert.equal(conflict!.vars!.n, 2);
  assert.deepEqual(conflict!.agentIds!.sort(), [1, 2]);
});
test("fileConflicts: bir repoда bir faylni 2 agent → to'qnashuv; boshqa repo → yo'q", () => {
  const wh = (id: number, folder: string, labels: string[]) => ({ ...baseAgent(id, folder), toolHistory: labels.map((l, i) => ({ label: l, at: i })) });
  const cs = fileConflicts([
    wh(1, "repo", ["Edit store.ts"]),
    wh(2, "repo", ["Edit store.ts"]),
    wh(3, "repo", ["Edit other.ts"]),
    wh(4, "repoB", ["Edit store.ts"]), // boshqa repo — yolg'on signal EMAS
  ]);
  assert.equal(cs.length, 1, "faqat bitta to'qnashuv bo'lishi kerak");
  assert.equal(cs[0].file, "store.ts");
  assert.equal(cs[0].folderName, "repo");
  assert.deepEqual(cs[0].ids.sort(), [1, 2]);
});
test("buildInsights: boshqa REPOда bir xil fayl → to'qnashuv EMAS (yolg'on signal yo'q)", () => {
  const ins = buildInsights([
    { ...baseAgent(1, "repoA"), toolHistory: [{ label: "Edit store.ts", at: 0 }] },
    { ...baseAgent(2, "repoB"), toolHistory: [{ label: "Edit store.ts", at: 0 }] },
  ], [], Date.now());
  assert.ok(!ins.some((i) => i.key === "insight.conflict"), "har xil repo → to'qnashuv yo'q");
});
test("buildInsights: bir yorliq 4× ketma-ket → sikl", () => {
  const ins = buildInsights([
    { ...baseAgent(1, "r"), toolHistory: [0, 1, 2, 3].map((i) => ({ label: "Bash npm test", at: i })) },
  ], [], Date.now());
  assert.ok(ins.some((i) => i.key === "insight.loop"), "sikl aniqlanishi kerak");
});
test("buildInsights: kontekst 85%+ → turg'un ogohlantirish (/compact)", () => {
  const ins = buildInsights([
    { ...baseAgent(1, "r"), active: true, status: "working", inputTokens: 190000, contextWindow: 200000 },
  ], [], Date.now());
  const ctx = ins.find((i) => i.key === "insight.contextHot");
  assert.ok(ctx, "kontekst issiq aniqlanishi kerak");
  assert.equal(ctx!.level, "warn");
  assert.equal(ctx!.vars!.n, 95, "foiz to'g'ri hisoblanishi kerak");
});
test("buildInsights: kontekst past → issiq ogohlantirish yo'q", () => {
  const ins = buildInsights([
    { ...baseAgent(1, "r"), active: true, status: "working", inputTokens: 100000, contextWindow: 200000 },
  ], [], Date.now());
  assert.ok(!ins.some((i) => i.key === "insight.contextHot"), "50% → issiq emas");
});
test("buildInsights: ogohlantirish bo'lmasa → 'hammasi joyida'", () => {
  const ins = buildInsights([{ ...baseAgent(1, "r"), active: true, status: "working" }], [], Date.now());
  assert.equal(ins[ins.length - 1].key, "insight.calm");
  assert.ok(!ins.some((i) => i.level === "warn"));
});

console.log("Sessiya hikoyasi:");
test("toolCat: yorliqdan turkum (edit/read/test/run/research)", () => {
  assert.equal(toolCat("Edit src/App.tsx"), "edit");
  assert.equal(toolCat("Write README.md"), "edit");
  assert.equal(toolCat("Read foo.ts"), "read");
  assert.equal(toolCat("Grep TODO"), "read");
  assert.equal(toolCat("Bash npm test"), "test", "test buyrug'i → test");
  assert.equal(toolCat("Bash pytest -q"), "test");
  assert.equal(toolCat("Bash git commit"), "run", "oddiy buyruq → run");
  assert.equal(toolCat("WebSearch claude"), "research");
});
test("buildStory: o'lchangan holatdan hikoya; eng band agent birinchi; turkumlar", () => {
  useOffice.setState({ agents: {}, order: [], samples: [] });
  const s = useOffice.getState();
  s.addAgent({ id: 700, folderName: "api", role: "backend" });
  s.addAgent({ id: 701, folderName: "web", role: "frontend" });
  const a = useOffice.getState().agents;
  useOffice.setState({
    agents: {
      700: { ...a[700], toolCalls: 30, turns: 3, activeMs: 60000, costUsd: 1.4, inputTokens: 100000, outputTokens: 10000,
        billed: { input: 20000, cacheWrite: 5000, cacheRead: 200000, output: 10000 },
        toolHistory: [{ label: "Edit x.ts", at: 1 }, { label: "Edit y.ts", at: 2 }, { label: "Bash npm test", at: 3 }, { label: "Read z.ts", at: 4 }] },
      701: { ...a[701], toolCalls: 5, turns: 1, activeMs: 20000, toolHistory: [{ label: "Read a.ts", at: 1 }] },
    },
  });
  const st = useOffice.getState();
  const story = buildStory(st.order.map((id) => st.agents[id]), 1_700_000_000_000);
  assert.equal(story[0].id, 700, "eng band (30 tool) birinchi");
  assert.equal(story[0].cats[0].cat, "edit", "asosan tahrir (2 edit)");
  assert.equal(story[0].cats[0].n, 2);
  assert.ok(story[0].cats.some((c) => c.cat === "test"), "test ham bor");
  assert.ok(story[0].cacheSavedPct > 0, "kesh tejami hisoblanadi");
  assert.equal(story[1].id, 701);
  useOffice.setState({ agents: {}, order: [], samples: [] });
});

test("storyMarkdown: hikoyani markdown'ga (sarlavha + o'lchangan qatorlar)", () => {
  const stories = [
    { id: 1, name: "api", roleKey: "backend", model: "claude-opus-4-8", task: "Fix the billing webhook", ms: 60000, turns: 3, tools: 30,
      cats: [{ cat: "edit" as const, n: 2 }, { cat: "test" as const, n: 1 }], subagents: 1, cost: 1.4, tokens: 110000, cacheSavedPct: 55 },
  ];
  const md = storyMarkdown(stories, (k) => k);
  assert.ok(md.includes("# story.title"), "hujjat sarlavhasi");
  assert.ok(md.includes("## api — role.backend"), "agent sarlavhasi");
  assert.ok(md.includes("📋 Fix the billing webhook"), "vazifa (task) satri");
  assert.ok(md.includes("story.worked"), "ish qatori bo'lishi kerak");
  assert.ok(md.includes("🧰"), "asosan-nima qatori");
  assert.ok(md.includes("🌳"), "sub-agent qatori");
  assert.ok(md.includes("💰"), "xarajat qatori");
});
test("storyMarkdown: bo'sh ro'yxat → 'ma'lumot yo'q'", () => {
  assert.ok(storyMarkdown([], (k) => k).includes("dash.noData"));
});

console.log("Tarix (kunlik/loyiha jamlanma):");
test("history: dailyCost — sana o'sish tartibida, kun ichi jamlanadi", () => {
  const days = [
    { date: "2026-08-02", projects: { repo: { cost: 1, inTok: 0, outTok: 0, tools: 0, ms: 0 } } },
    { date: "2026-08-01", projects: { repo: { cost: 0.5, inTok: 0, outTok: 0, tools: 0, ms: 0 }, other: { cost: 0.5, inTok: 0, outTok: 0, tools: 0, ms: 0 } } },
  ];
  const dc = dailyCost(days);
  assert.deepEqual(dc.map((d) => d.date), ["2026-08-01", "2026-08-02"], "sana bo'yicha o'sish");
  assert.equal(dc[0].cost, 1, "kun ichi loyihalar jamlanadi (0.5+0.5)");
});
test("history: projectTotals — loyiha bo'yicha jam, kamayish tartibida", () => {
  const days = [
    { date: "2026-08-01", projects: { a: { cost: 1, inTok: 10, outTok: 0, tools: 2, ms: 0 } } },
    { date: "2026-08-02", projects: { a: { cost: 2, inTok: 20, outTok: 0, tools: 3, ms: 0 }, b: { cost: 0.5, inTok: 0, outTok: 0, tools: 0, ms: 0 } } },
  ];
  const pt = projectTotals(days);
  assert.equal(pt[0].project, "a", "eng qimmat loyiha birinchi");
  assert.equal(pt[0].stat.cost, 3, "kunlar bo'yicha jamlanadi");
  assert.equal(pt[0].stat.tools, 5);
  assert.equal(pt[1].project, "b");
});
test("history: dayStatFor — topilmasa nol", () => {
  assert.equal(dayStatFor([], "2026-08-01").cost, 0);
});

console.log("Ko'p-oyna hook yo'naltirish:");
test("hookRouting: pickServerForCwd — cwd bo'yicha eng aniq (uzun) papkani tanlaydi", () => {
  const A: ServerEntry = { port: 1, token: "a", pid: 10, folders: ["/home/u/proj"] };
  const B: ServerEntry = { port: 2, token: "b", pid: 11, folders: ["/home/u/proj/sub", "/home/u/other"] };
  assert.equal(pickServerForCwd([A, B], "/home/u/proj/sub/x")?.port, 2, "eng uzun mos papka (B/sub)");
  assert.equal(pickServerForCwd([A, B], "/home/u/proj/deep")?.port, 1, "faqat A mos");
  assert.equal(pickServerForCwd([A, B], "/home/u/other")?.port, 2, "B ning ikkinchi papkasi");
  assert.equal(pickServerForCwd([A, B], "/home/u/proj")?.port, 1, "aynan A papkasi");
  assert.equal(pickServerForCwd([A, B], "/tmp/elsewhere"), null, "mos yo'q → null");
  assert.equal(pickServerForCwd([], "/home/u/proj"), null, "server yo'q → null");
  // within — ish-papka tekshiruvi (OfficeViewProvider.isInWorkspace + CLI inProjects ham shuni ishlatadi).
  assert.equal(within("/home/u/proj/sub", "/home/u/proj"), true);
  assert.equal(within("/home/u/project2", "/home/u/proj"), false, "prefiks-o'xshash boshqa papka EMAS");
  assert.equal(within("/home/u/proj/", "/home/u/proj"), true, "oxirgi ajratgich");
  if (process.platform === "win32") assert.equal(within("c:/Users/x/proj/a", "C:\\Users\\x\\proj"), true, "aralash ajratgich + harf");
  // Aralash ajratgich (Windows): folder "\\", cwd "/" — baribir mos kelishi kerak.
  const W: ServerEntry = { port: 9, token: "w", pid: 9, folders: ["C:\\Users\\x\\proj"] };
  assert.equal(pickServerForCwd([W], "C:/Users/x/proj/sub")?.port, 9, "forward cwd + backslash folder mos");
  assert.equal(pickServerForCwd([W], "C:\\Users\\x\\proj\\sub")?.port, 9, "backslash cwd ham mos");
  assert.equal(pickServerForCwd([W], "C:\\Users\\x\\projector"), null, "qisman nom prefiksi mos EMAS (proj ≠ projector)");
});

console.log("Tarix saqlashi (host — HistoryStore, scratch home):");
function withScratchHome<T>(fn: (home: string) => T): T {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ao-hist-"));
  const prevU = process.env.USERPROFILE;
  const prevH = process.env.HOME;
  process.env.USERPROFILE = home;
  process.env.HOME = home; // os.homedir() runtime env'ni hurmat qiladi
  try {
    return fn(home);
  } finally {
    if (prevU === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevU;
    if (prevH === undefined) delete process.env.HOME; else process.env.HOME = prevH;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test("HistoryStore: record delta — kunlik jamlanma IKKI BAROBAR bo'lmaydi", () => {
  withScratchHome(() => {
    const h = new HistoryStore();
    h.load();
    h.record("s1", "repo", { cost: 1, inTok: 100, outTok: 10, tools: 2, ms: 1000 });
    h.record("s1", "repo", { cost: 3, inTok: 300, outTok: 30, tools: 5, ms: 3000 }); // kumulyativ o'sdi
    const proj = Object.values(h.getDays()[0].projects)[0];
    assert.equal(proj.cost, 3, "delta: 1 + (3-1) = 3, ikki barobar (4) EMAS");
    assert.equal(proj.tools, 5, "2 + (5-2) = 5");
    h.flush();
  });
});

test("HistoryStore: model round-trip (B1) — sessiya modeli saqlanadi, kelmasa oldingisi qoladi", () => {
  withScratchHome(() => {
    const h = new HistoryStore();
    h.load();
    h.record("s1", "repo", { cost: 1, inTok: 10, outTok: 0, tools: 1, ms: 0 }, "claude-opus-4-8");
    assert.equal(h.getSessions()[0].model, "claude-opus-4-8", "model saqlanadi");
    h.record("s1", "repo", { cost: 2, inTok: 20, outTok: 0, tools: 2, ms: 0 }); // modelsiz
    assert.equal(h.getSessions()[0].model, "claude-opus-4-8", "model kelmasa oldingisi saqlanadi");
    h.flush();
  });
});

test("HistoryStore: BUZUQ history.json → USTIDAN YOZMAYDI (ma'lumot saqlanadi)", () => {
  withScratchHome((home) => {
    const dir = path.join(home, ".agent-office");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "history.json");
    fs.writeFileSync(file, "{ buzuq ,, json }");
    const h = new HistoryStore();
    h.load();
    h.record("s1", "repo", { cost: 5, inTok: 0, outTok: 0, tools: 0, ms: 0 });
    h.flush(); // corrupt → yozmaydi
    assert.equal(fs.readFileSync(file, "utf8"), "{ buzuq ,, json }", "buzuq fayl o'zgarmasligi kerak");
  });
});

test("HistoryStore: atomik yozuv + qayta yuklash — kun/sessiya/model saqlanadi", () => {
  withScratchHome(() => {
    const h1 = new HistoryStore();
    h1.load();
    h1.record("s1", "repo", { cost: 2, inTok: 100, outTok: 0, tools: 3, ms: 0 }, "claude-sonnet-4-5");
    h1.flush(); // diskka
    const h2 = new HistoryStore();
    h2.load();
    assert.equal(h2.getSessions().length, 1, "qayta yuklashda sessiya bor");
    assert.equal(h2.getSessions()[0].model, "claude-sonnet-4-5", "model qayta yuklanadi");
    assert.equal(Object.values(h2.getDays()[0].projects)[0].cost, 2, "kunlik cost qayta yuklanadi");
  });
});
test("HistoryStore: ikki oyna bitta faylga yozadi — bir-birini O'CHIRMAYDI, bir sessiya IKKI MARTA hisoblanmaydi", () => {
  withScratchHome(() => {
    const A = new HistoryStore();
    const B = new HistoryStore();
    A.load();
    B.load(); // ikkalasi ham bo'sh holatda yuklandi (avval: oxirgi yozgan g'olib)
    A.record("sA", "repoA", { cost: 1, inTok: 10, outTok: 1, tools: 1, ms: 100 });
    B.record("sB", "repoB", { cost: 2, inTok: 20, outTok: 2, tools: 2, ms: 200 });
    A.flush();
    B.flush();
    const C = new HistoryStore();
    C.load();
    const projects = C.getDays()[0].projects;
    assert.equal(projects.repoA?.cost, 1, "A oynasining yozuvi saqlandi");
    assert.equal(projects.repoB?.cost, 2, "B oynasining yozuvi saqlandi");
    assert.equal(C.getSessions().length, 2);
    // Bitta sessiyani ikkala oyna kuzatsa (bir xil papka 2 oynada) — jami bir marta.
    A.record("sShared", "repoA", { cost: 5, inTok: 0, outTok: 0, tools: 0, ms: 0 });
    B.record("sShared", "repoA", { cost: 5, inTok: 0, outTok: 0, tools: 0, ms: 0 });
    A.flush();
    B.flush();
    const D = new HistoryStore();
    D.load();
    assert.equal(D.getDays()[0].projects.repoA.cost, 6, "1 + 5 (10 EMAS)");
  });
});

test("tarix HOST holatidan yoziladi (webview'siz): xarajat/tool; o'qilayotgan agent o'tkaziladi; o'zgarishsiz — yozuv yo'q", () => {
  withScratchHome((home) => {
    const h = new HistoryStore();
    h.load();
    const a = createAgentState(1, "/x/s1.jsonl", "repo", { sessionId: "s1" });
    a.costUsd = 2.5;
    a.outputTokens = 100;
    a.toolCats = { edit: 3, read: 2 };
    a.model = "claude-opus-5-5";
    const busy = createAgentState(2, "/x/s2.jsonl", "repo", { sessionId: "s2" });
    busy.priming = true; // tarix hali o'qilmoqda — qisman qiymat yozilmasin
    busy.costUsd = 9;
    recordFromAgents(h, [a, busy]);
    const day = h.getDays()[0].projects.repo;
    assert.equal(day.cost, 2.5);
    assert.equal(day.tools, 5, "tool soni = host toolCats yig'indisi");
    assert.equal(h.getSessions().length, 1, "priming agent yozilmadi");
    assert.equal(h.getSessions()[0].model, "claude-opus-5-5");
    h.flush();
    const file = path.join(home, ".agent-office", "history.json");
    const m1 = fs.statSync(file).mtimeMs;
    recordFromAgents(h, [a]); // hech narsa o'zgarmadi
    h.flush();
    assert.equal(fs.statSync(file).mtimeMs, m1, "o'zgarishsiz — fayl qayta yozilmadi");
    a.costUsd = 4;
    recordFromAgents(h, [a]);
    assert.equal(h.getDays()[0].projects.repo.cost, 4, "delta: 2.5 + 1.5");
    h.flush();
  });
});

test("history: modelTotals — arxiv sessiyalari short-model bo'yicha jamlanadi", () => {
  const sessions = [
    { project: "a", at: 1, cost: 2, inTok: 100, outTok: 50, tools: 3, ms: 0, model: "claude-opus-4-8" },
    { project: "b", at: 2, cost: 1, inTok: 200, outTok: 0, tools: 1, ms: 0, model: "claude-opus-4-8" },
    { project: "c", at: 3, cost: 2, inTok: 10, outTok: 0, tools: 0, ms: 0, model: "claude-sonnet-4-5" },
    { project: "d", at: 4, cost: 5, inTok: 0, outTok: 0, tools: 0, ms: 0 }, // modeli yo'q — hisobga olinmaydi
  ];
  const mt = modelTotals(sessions);
  assert.equal(mt.length, 2, "faqat modelli sessiyalar, short bo'yicha guruh");
  assert.equal(mt[0].model, "Opus 4.8", "eng qimmat model birinchi");
  assert.equal(mt[0].cost, 3, "ikki Opus sessiyasi jamlanadi (2+1)");
  assert.equal(mt[0].count, 2);
  assert.equal(mt[0].tok, 350, "tokenlar jamlanadi (150+200)");
  assert.equal(mt[1].model, "Sonnet 4.5");
});
test("history: historyCsv — header + kunlik qatorlar (sana o'sish, vergul qochirish)", () => {
  const days = [
    { date: "2026-08-02", projects: { repo: { cost: 2.5, inTok: 100, outTok: 20, tools: 3, ms: 5000 } } },
    { date: "2026-08-01", projects: { "a,b": { cost: 1, inTok: 10, outTok: 0, tools: 1, ms: 100 } } },
  ];
  const lines = historyCsv(days).split("\n");
  assert.equal(lines[0], "date,project,cost_usd,input_tokens,output_tokens,tools,active_ms");
  assert.equal(lines[1], '2026-08-01,"a,b",1.0000,10,0,1,100', "eng erta sana birinchi + vergulli nom qochiriladi");
  assert.equal(lines[2], "2026-08-02,repo,2.5000,100,20,3,5000");
});
test("history: rollupCost — kun/oy guruhlash + hafta kaliti dushanba, jami saqlanadi", () => {
  const st = (c: number) => ({ cost: c, inTok: 0, outTok: 0, tools: 0, ms: 0 });
  const days = [
    { date: "2026-08-10", projects: { r: st(1) } },
    { date: "2026-08-11", projects: { r: st(2) } },
    { date: "2026-08-25", projects: { r: st(4) } },
    { date: "2026-09-02", projects: { r: st(8) } },
  ];
  assert.equal(rollupCost(days, "day").length, 4, "kun: har kun alohida");
  const byMonth = rollupCost(days, "month");
  assert.deepEqual(byMonth.map((b) => b.key), ["2026-08", "2026-09"], "oy: YYYY-MM, sortlangan");
  assert.equal(byMonth[0].cost, 7, "avgust = 1+2+4");
  assert.equal(byMonth[1].cost, 8, "sentabr = 8");
  const byWeek = rollupCost(days, "week");
  assert.equal(byWeek.reduce((s, b) => s + b.cost, 0), 15, "hafta guruhida jami saqlanadi");
  assert.ok(byWeek.length <= 4, "hafta guruhi kunlardan ko'p emas");
  for (const b of byWeek) assert.equal(new Date(b.key + "T00:00:00").getDay(), 1, "hafta kaliti dushanbaga to'g'ri keladi");
});

test("agentSnapshotMessages: token snapshot billed + model'ni o'z ichiga oladi (reload'da xarajat saqlanadi)", () => {
  const agent = createAgentState(1, "/x/s.jsonl", "proj", { isExternal: true, sessionId: "s" });
  agent.inputTokens = 100000; agent.outputTokens = 5000;
  agent.billedInput = 30000; agent.billedCacheWrite = 5000; agent.billedCacheRead = 120000;
  agent.model = "claude-opus-4-8";
  const msgs = agentSnapshotMessages(agent);
  const tok = msgs.find((m) => m.type === "agentTokenUsage") as { billedInput?: number; billedCacheRead?: number; model?: string } | undefined;
  assert.ok(tok, "token snapshot bo'lishi kerak");
  assert.equal(tok!.billedInput, 30000, "billedInput yuborilishi kerak (xarajat uchun)");
  assert.equal(tok!.billedCacheRead, 120000, "billedCacheRead yuborilishi kerak");
  assert.equal(tok!.model, "claude-opus-4-8", "model yuborilishi kerak");
});
test("agentSnapshotMessages: session statlari (snap) ENG OXIRIDA qaytariladi (reload'da 0 emas)", () => {
  const agent = createAgentState(2, "/x/s2.jsonl", "proj", { isExternal: true, sessionId: "s2" });
  agent.snapToolCalls = 42; agent.snapTurns = 5; agent.snapActiveMs = 123000;
  const msgs = agentSnapshotMessages(agent);
  const ss = msgs.find((m) => m.type === "agentSessionStats") as { toolCalls?: number; turns?: number; activeMs?: number } | undefined;
  assert.ok(ss, "agentSessionStats bo'lishi kerak");
  assert.equal(ss!.toolCalls, 42);
  assert.equal(ss!.turns, 5);
  assert.equal(ss!.activeMs, 123000);
  // ENG OXIRIDA — tool-start replay'lari toolCalls'ni oshirmasin (override qilsin)
  assert.equal(msgs[msgs.length - 1].type, "agentSessionStats", "eng oxirida bo'lishi kerak");
});

console.log("Xarajat (host) — qayta o'qishda double-count YO'Q:");
test("primeFromStart: token akkumulyatorlari qayta o'qishda IKKI BAROBAR bo'lmaydi", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ao-cost-"));
  const file = path.join(dir, "s.jsonl");
  const line = (i: number, o: number, cr: number, cw: number) => JSON.stringify({
    type: "assistant",
    message: { model: "claude-opus-4-8", usage: { input_tokens: i, output_tokens: o, cache_read_input_tokens: cr, cache_creation_input_tokens: cw }, content: [{ type: "text", text: "hi" }] },
  });
  fs.writeFileSync(file, line(100, 10, 50, 20) + "\n" + line(200, 15, 300, 30) + "\n");
  const store = new AgentStateStore();
  const agent = createAgentState(1, file, "proj", { isExternal: true, sessionId: "s" });
  const w = new FileWatcher(store);
  w.primeFromStart(agent);
  assert.equal(agent.billedInput, 300, "birinchi o'qish: billedInput 100+200");
  assert.equal(agent.outputTokens, 25, "output 10+15");
  assert.equal(agent.billedCacheRead, 350);
  w.primeFromStart(agent); // /clear · /resume · truncate simulyatsiyasi
  assert.equal(agent.billedInput, 300, "QAYTA o'qish: billed ikki barobar bo'lmasligi kerak");
  assert.equal(agent.outputTokens, 25, "output ikki barobar bo'lmasligi kerak");
  assert.equal(agent.billedCacheRead, 350, "cacheRead ikki barobar emas");
  if (agent.waitingTimer) clearTimeout(agent.waitingTimer); // idle-timer jarayonni ushlamasin
  fs.rmSync(dir, { recursive: true, force: true });
});

test("primeFromStart: tool turkumlari (toolCats) — to'g'ri sanaydi, qayta o'qishda ikki barobar emas", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ao-tc-"));
  const file = path.join(dir, "s.jsonl");
  const tu = (id: string, name: string, inp: Record<string, unknown>) => JSON.stringify({
    type: "assistant",
    message: { model: "claude-opus-4-8", usage: { input_tokens: 100, output_tokens: 10 }, content: [{ type: "tool_use", id, name, input: inp }] },
  });
  fs.writeFileSync(file, [
    tu("a", "Edit", { file_path: "x.ts" }),
    tu("b", "Read", { file_path: "y.ts" }),
    tu("c", "Bash", { command: "npm test" }),
    tu("d", "Bash", { command: "npm run build" }),
  ].join("\n") + "\n");
  const store = new AgentStateStore();
  const agent = createAgentState(1, file, "proj", { isExternal: true, sessionId: "s" });
  const w = new FileWatcher(store);
  w.primeFromStart(agent);
  assert.equal(agent.toolCats.edit, 1, "Edit → edit");
  assert.equal(agent.toolCats.read, 1, "Read → read");
  assert.equal(agent.toolCats.test, 1, "Bash npm test → test");
  assert.equal(agent.toolCats.run, 1, "Bash npm run build → run");
  w.primeFromStart(agent); // /clear · /resume · truncate simulyatsiyasi
  assert.equal(agent.toolCats.edit, 1, "QAYTA o'qish: edit ikki barobar EMAS");
  assert.equal(agent.toolCats.run, 1, "run ikki barobar EMAS");
  if (agent.waitingTimer) clearTimeout(agent.waitingTimer);
  fs.rmSync(dir, { recursive: true, force: true });
});

console.log("Personaj — rol imzo aksessuari:");
test("characterFor: rol bo'yicha ustuvor aksessuar + id bo'yicha xilma-xillik", () => {
  // Ustuvor (id 0) — rolni bir qarashda tanitadi
  assert.equal(characterFor("backend", 0, 0).accessory, "headphones", "Backend — naushnik");
  assert.equal(characterFor("docs", 0, 0).accessory, "glasses", "Hujjatlar — ko'zoynak");
  assert.equal(characterFor("qa", 0, 0).accessory, "cap", "QA — kepka");
  assert.equal(characterFor("research", 0, 0).accessory, "glasses", "Tadqiqot — ko'zoynak");
  // Bir xil rolli, boshqa id → variant farqlanadi (aynan bir xil emas)
  assert.equal(characterFor("backend", 0, 2).accessory, "cap", "3-Backend boshqacha aksessuar");
  // Rol yo'q → seat fallback ishlaydi, crash bo'lmaydi
  assert.doesNotThrow(() => characterFor(undefined, 3, 5));
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
test("matchAgents: vazifa (task) matni bo'yicha ham topiladi", () => {
  const list = [
    { id: 1, folderName: "web", roleLabel: "Frontend", statusLabel: "Ishlamoqda", task: "Implement the auth flow" },
    { id: 2, folderName: "api", roleLabel: "Backend", statusLabel: "Ishlamoqda", task: "Fix the billing webhook" },
  ];
  assert.deepEqual(matchAgents(list, "auth").map((a) => a.id), [1], "vazifa matni bo'yicha");
  assert.deepEqual(matchAgents(list, "billing").map((a) => a.id), [2], "vazifa matni bo'yicha (2)");
  // Papka nomi vazifadan ustun (folder 'api' — task 'auth'дан kuchli emas, lekin
  // 'api' so'rovda faqat 2ni topadi)
  assert.deepEqual(matchAgents(list, "api").map((a) => a.id), [2], "papka nomi baribir ishlaydi");
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

// ── Async testlar (ketma-ket, sinxronlardan keyin) ──
const asyncTests: { name: string; fn: () => Promise<void> }[] = [];
function testAsync(name: string, fn: () => Promise<void>): void {
  asyncTests.push({ name, fn });
}

testAsync("katta transcript bo'laklab o'qiladi: darrov qaytadi, boshqa agent jonli, oxirida to'g'ri snapshot", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ao-bigprime-"));
  const file = path.join(dir, "big.jsonl");
  const pad = "z".repeat(4000);
  const lines: string[] = [];
  for (let i = 0; i < 1300; i++) {
    // Har xabar 2 qatorga bo'lingan (dedupe ham tekshiriladi) + katta matn.
    const l = JSON.stringify({ type: "assistant", message: { id: `m${i}`, content: [{ type: "text", text: pad }], usage: { input_tokens: 1, output_tokens: 2 } } });
    lines.push(l, l);
  }
  fs.writeFileSync(file, lines.join("\n") + "\n");
  assert.ok(fs.statSync(file).size > 4 * 1024 * 1024, "sinov fayli > 4MB");
  const store = new AgentStateStore();
  const watcher = new FileWatcher(store);
  const other = createAgentState(store.allocateId(), path.join(dir, "o.jsonl"), "o", { sessionId: "o" });
  store.add(other);
  const ev: { type: string; id?: number }[] = [];
  store.on("broadcast", (m: { type: string; id?: number }) => ev.push(m));
  const big = createAgentState(store.allocateId(), file, "p", { sessionId: "big" });
  let added = false;
  watcher.primeAndAdd(big, () => {
    store.add(big);
    added = true;
  });
  assert.ok(added && store.has(big.id), "agent darrov qo'shildi (personaj ko'rinadi)");
  assert.equal(big.priming, true, "hali o'qilmoqda — sinxron bloklamadi");
  store.broadcast({ type: "agentStatus", id: other.id, status: "active" });
  assert.ok(ev.some((e) => e.id === other.id), "boshqa agent broadcast'i o'tadi");
  const bigDuring = ev.filter((e) => e.id === big.id).length;
  while (big.priming) await new Promise((r) => setImmediate(r));
  assert.equal(bigDuring, 0, "o'qish davomida shu agentning tarixi flood qilinmadi");
  assert.equal(big.outputTokens, 2600, "1300 xabar × 2 (dedupe — 5200 EMAS)");
  assert.ok(ev.some((e) => e.id === big.id && e.type === "agentTokenUsage"), "yakuniy snapshot yuborildi");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("manifest i18n: package.json'dagi har %kalit% package.nls.json'da bor, har til to'liq", () => {
  const root = __dirname; // test bundle (.test-out.cjs) repo ildizida ishlaydi
  const pkgRaw = fs.readFileSync(path.join(root, "package.json"), "utf8");
  const refs = (pkgRaw.match(/"%([a-zA-Z.]+)%"/g) ?? []).map((s) => s.slice(2, -2));
  assert.ok(refs.length >= 10, "buyruqlar + sozlamalar lokalizatsiya qilingan");
  const base = JSON.parse(fs.readFileSync(path.join(root, "package.nls.json"), "utf8")) as Record<string, string>;
  for (const r of refs) assert.ok(base[r], `package.nls.json'da yo'q: ${r}`);
  const files = fs.readdirSync(root).filter((f) => /^package\.nls\.[a-z-]+\.json$/.test(f));
  assert.ok(files.length >= 6, "tarjimalar mavjud");
  for (const f of files) {
    const tr = JSON.parse(fs.readFileSync(path.join(root, f), "utf8")) as Record<string, string>;
    assert.deepEqual(Object.keys(tr).sort(), Object.keys(base).sort(), `${f} kalitlari to'liq`);
    for (const [k, v] of Object.entries(tr)) assert.ok(typeof v === "string" && v.trim(), `${f}:${k} bo'sh`);
  }
});

test("isStaleExternal: faqat bog'lanmagan + kutayotgan + band emas + 30 daqiqa faoliyatsiz", () => {
  const now = 10 * STALE_IDLE_MS;
  const base = { isExternal: true, boundToOpenTerminal: false, isWaiting: true, busy: false, fileMtimeMs: now - STALE_IDLE_MS, now };
  assert.equal(isStaleExternal(base), true);
  assert.equal(isStaleExternal({ ...base, fileMtimeMs: now - STALE_IDLE_MS + 1000 }), false, "yaqinda faol");
  assert.equal(isStaleExternal({ ...base, boundToOpenTerminal: true }), false, "ochiq terminal — u yopilganda olinadi");
  assert.equal(isStaleExternal({ ...base, isWaiting: false }), false, "ishlayapti");
  assert.equal(isStaleExternal({ ...base, busy: true }), false, "ruxsat kutyapti / tool ochiq");
  assert.equal(isStaleExternal({ ...base, isExternal: false }), false, "+Agent terminali");
});

testAsync("eskirgan tashqi agent olinadi, fayl o'zgarmaguncha QAYTA qo'shilmaydi, o'zgarsa qaytadi", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ao-stale-"));
  const prevU = process.env.USERPROFILE;
  const prevH = process.env.HOME;
  process.env.USERPROFILE = home;
  process.env.HOME = home;
  try {
    const proj = path.join(home, "proj");
    fs.mkdirSync(proj);
    resetState(proj);
    const store = new AgentStateStore();
    const watcher = { primeFromStart() {}, emitSnapshot() {}, primeAndAdd(_a: unknown, add: () => void) { add(); }, reprime() {} } as unknown as import("../extension/server/fileWatcher.js").FileWatcher;
    const mgr = new AgentManager(store, watcher, () => {});
    mgr.start();
    const m = mgr as unknown as { startupTime: number; removeStale(): Promise<void>; scanForNew(): Promise<void>; dispose(): void };
    m.startupTime = Date.now() - 2 * STALE_IDLE_MS; // ochilganiga 1 soat bo'lgan
    const dir = getSessionDir(proj);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "sess-old.jsonl");
    fs.writeFileSync(file, "{}\n");
    const old = new Date(Date.now() - STALE_IDLE_MS - 60_000);
    fs.utimesSync(file, old, old);
    const a = mgr.ensureSessionAgent("sess-old", proj);
    assert.ok(store.has(a.id) && a.isExternal);
    await m.removeStale();
    assert.equal(store.has(a.id), false, "30+ daqiqa faoliyatsiz — olindi");
    await m.scanForNew();
    assert.equal(store.size, 0, "fayl o'zgarmagan — qayta qo'shilmadi (aylanish yo'q)");
    fs.appendFileSync(file, "{}\n"); // sessiya davom etdi
    await m.scanForNew();
    assert.equal(store.size, 1, "yangi faoliyat — agent qaytdi");
    m.dispose();
  } finally {
    if (prevU === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevU;
    if (prevH === undefined) delete process.env.HOME; else process.env.HOME = prevH;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

void (async () => {
  if (asyncTests.length) console.log("Async testlar:");
  for (const t of asyncTests) {
    try {
      await t.fn();
      passed++;
      console.log("  ✓", t.name);
    } catch (e) {
      failed++;
      console.log("  ✗", t.name, "\n     ", (e as Error).message);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
