import { create } from "zustand";
import { AGENTS, EVENT_VERBS } from "../config.js";

// ── Simulyatsiya do'koni ─────────────────────────────────────
// Bu qatlam keyinchalik WebSocket bilan almashtiriladi:
// ws.onmessage → applyEvent(event) chaqiriladi, state machine o'chiriladi.

const now = () =>
  new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const useSim = create((set, get) => ({
  agents: AGENTS.map((a) => ({
    id: a.id, name: a.name, role: a.role, model: a.model, tasks: a.tasks,
    state: "idle", task: null, progress: 0, tokens: 0,
    stateTimer: 1 + Math.random() * 3, logs: [],
  })),
  feed: [],
  beams: [], // { id, fromId|'hub', toId|'hub', color, born }
  stats: { done: 0, tokens: 0 },
  selectedId: null,

  select: (id) => set({ selectedId: id }),

  pushEvent: (agentName, verb, extra = "") =>
    set((s) => ({ feed: [{ id: Math.random(), time: now(), agentName, verb, extra }, ...s.feed].slice(0, 7) })),

  spawnBeam: (fromId, toId, color) =>
    set((s) => ({ beams: [...s.beams, { id: Math.random(), fromId, toId, color, born: performance.now() }] })),

  cleanBeams: () =>
    set((s) => ({ beams: s.beams.filter((b) => performance.now() - b.born < 2400) })),

  tick: () => {
    const { pushEvent, spawnBeam } = get();
    let doneInc = 0, tokenInc = 0;
    set((s) => {
      const agents = s.agents.map((raw) => {
        const a = { ...raw, logs: [...raw.logs] };
        a.stateTimer -= 1.4;
        if (a.state === "working" || a.state === "collab") {
          a.progress = Math.min(100, a.progress + 6 + Math.random() * 10);
          const tk = Math.floor(200 + Math.random() * 900);
          a.tokens += tk; tokenInc += tk;
        }
        if (a.stateTimer > 0) return a;

        switch (a.state) {
          case "idle": {
            a.task = a.tasks[Math.floor(Math.random() * a.tasks.length)];
            a.state = "thinking";
            a.progress = 0;
            a.stateTimer = 2.5 + Math.random() * 3;
            a.logs.unshift(`Vazifa: ${a.task}`);
            spawnBeam("hub", a.id, "#3a8fe8");
            pushEvent(a.name, EVENT_VERBS.assigned, `— ${a.task}`);
            break;
          }
          case "thinking": {
            a.state = "working";
            a.stateTimer = 5 + Math.random() * 6;
            a.logs.unshift("Reja tayyor, bajarilmoqda");
            pushEvent(a.name, EVENT_VERBS.working);
            break;
          }
          case "working": {
            const r = Math.random();
            if (r < 0.12) {
              a.state = "blocked";
              a.stateTimer = 3 + Math.random() * 3;
              a.logs.unshift("To'siq: tashqi resurs javob bermayapti");
              pushEvent(a.name, EVENT_VERBS.blocked, "· qayta urinish rejalashtirildi");
            } else if (r < 0.28) {
              a.state = "review";
              a.stateTimer = 3 + Math.random() * 3;
              a.logs.unshift("Natija tasdiqqa yuborildi");
              pushEvent(a.name, EVENT_VERBS.review);
            } else if (r < 0.42) {
              const others = s.agents.filter((x) => x.id !== a.id && x.state === "working");
              if (others.length) {
                const b = others[Math.floor(Math.random() * others.length)];
                a.state = "collab";
                a.stateTimer = 3.5 + Math.random() * 3;
                a.logs.unshift(`${b.name} bilan kontekst almashinuvi`);
                spawnBeam(a.id, b.id, "#3a8fe8");
                pushEvent(a.name, `${b.name} ${EVENT_VERBS.collab}`);
              } else a.stateTimer = 3;
            } else if (a.progress >= 96) {
              a.state = "idle";
              a.stateTimer = 2 + Math.random() * 4;
              a.logs.unshift(`Yakunlandi: ${a.task}`);
              spawnBeam(a.id, "hub", "#30d158");
              pushEvent(a.name, EVENT_VERBS.done, `— ${a.task}`);
              doneInc += 1;
              a.task = null;
              a.progress = 0;
            } else a.stateTimer = 3;
            break;
          }
          case "collab":
          case "blocked":
          case "review": {
            a.state = "working";
            a.stateTimer = 3 + Math.random() * 4;
            a.logs.unshift("Ish davom etmoqda");
            break;
          }
          default: break;
        }
        a.logs = a.logs.slice(0, 5);
        return a;
      });
      return {
        agents,
        stats: { done: s.stats.done + doneInc, tokens: s.stats.tokens + tokenInc },
      };
    });
    get().cleanBeams();
  },
}));

export function startSimulation() {
  const iv = setInterval(() => useSim.getState().tick(), 1400);
  return () => clearInterval(iv);
}
