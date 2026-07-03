// ── Standalone demo rejimи (VS Code'дан tashqarida, masalan Vercel) ──
// Soxta agentlar yaratib, holatlarини davriy o'zgartiradi — jonli 3D ofis
// namoyishи. Haqiqiy pipeline'дан o'tadi (window.postMessage → reducer).

const post = (m: unknown) => window.postMessage(m, "*");

const AGENTS = [
  { id: 1, folderName: "web-app", role: "frontend" },
  { id: 2, folderName: "api-server", role: "backend" },
  { id: 3, folderName: "research", role: "research" },
  { id: 4, folderName: "docs-site", role: "docs" },
  { id: 5, folderName: "data-pipe", role: "data" },
  { id: 6, folderName: "qa-suite", role: "qa" },
];

const TOOLS = [
  { name: "Edit", label: "Edit App.tsx" },
  { name: "Read", label: "Read config.ts" },
  { name: "Bash", label: "npm test" },
  { name: "Write", label: "Write api.ts" },
  { name: "Grep", label: "Grep useState" },
];

let started = false;
let toolCounter = 100;

export function startDemo(): void {
  if (started) return;
  started = true;

  for (const a of AGENTS) post({ type: "agentCreated", ...a });

  // Boshlang'ich holatlar
  post({ type: "agentStatus", id: 1, status: "active" });
  post({ type: "agentToolStart", id: 1, toolId: "s1", status: "Edit App.tsx", toolName: "Edit" });
  post({ type: "agentStatus", id: 3, status: "active" });
  post({ type: "agentStatus", id: 4, status: "waiting", awaitingInput: true });

  // Davriy o'zgarishlar
  setInterval(() => {
    const a = AGENTS[Math.floor(Math.random() * AGENTS.length)];
    const roll = Math.random();
    if (roll < 0.45) {
      const t = TOOLS[Math.floor(Math.random() * TOOLS.length)];
      post({ type: "agentStatus", id: a.id, status: "active" });
      post({ type: "agentToolStart", id: a.id, toolId: `s${toolCounter++}`, status: t.label, toolName: t.name });
    } else if (roll < 0.6) {
      post({ type: "agentStatus", id: a.id, status: "active" });
      post({ type: "agentToolsClear", id: a.id });
    } else if (roll < 0.75) {
      post({ type: "agentToolsClear", id: a.id });
      post({ type: "agentStatus", id: a.id, status: "waiting", awaitingInput: false });
    } else if (roll < 0.85) {
      post({ type: "agentStatus", id: a.id, status: "waiting", awaitingInput: true });
    } else if (roll < 0.95) {
      post({ type: "agentToolPermission", id: a.id });
    } else {
      post({ type: "subagentToolStart", id: a.id, parentToolId: "d", toolId: "d", status: "Task" });
      setTimeout(() => post({ type: "subagentClear", id: a.id, parentToolId: "d" }), 4000);
    }
    // Token o'sishи
    post({
      type: "agentTokenUsage",
      id: a.id,
      inputTokens: Math.floor(Math.random() * 80000),
      outputTokens: Math.floor(Math.random() * 40000),
    });
  }, 2200);
}
