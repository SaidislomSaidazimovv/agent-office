import assert from "node:assert";
import { AgentStateStore } from "../extension/server/agentStateStore.js";
import { handleHookEvent } from "../extension/server/hookHandler.js";
import { processTranscriptLine } from "../extension/server/transcriptParser.js";
import { createAgentState } from "../extension/server/types.js";
import { NODES, nearestNode, pathBetween } from "../webview-ui/src/scene/nav.js";

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

console.log("Navigation:");
test("pathBetween reaches a room interior through its door", () => {
  const p = pathBetween(nearestNode(0, 0), "server_i");
  assert.ok(p.length >= 2, "path too short");
  assert.deepEqual(p[p.length - 1], NODES["server_i"], "path does not end at room");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
