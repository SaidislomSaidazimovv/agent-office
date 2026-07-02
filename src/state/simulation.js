import { create } from "zustand";
import { AGENTS, EVENT_VERBS } from "../config.js";

// ── Simulyatsiya do'koni ─────────────────────────────────────
// Bu qatlam keyinchalik WebSocket bilan almashtiriladi:
// ws.onmessage → applyEvent(event) chaqiriladi, state machine o'chiriladi.
//
// Transport seam: barcha manbalar (lokal simulyatsiya yoki real backend)
// yagona `applyEvent` kirish nuqtasi orqali do'konni yangilaydi.
// Manba tanlash `src/state/transport.js` ichida (config.SOURCE bo'yicha).

/**
 * Yagona hodisa kontrakti (event contract).
 * Har qanday manba shu shakldagi hodisalarni chiqaradi va ular `applyEvent`
 * orqali do'konga qo'llaniladi.
 *
 * @typedef {"idle"|"thinking"|"working"|"review"|"blocked"|"collab"} AgentState
 *   Agent holati — STATUS (src/config.js) bilan mos keladi.
 *
 * @typedef {Object} AgentEvent
 * @property {string}       agentId  Agent id (masalan "nova").
 * @property {AgentState}   type     Yangi holat.
 * @property {string|null} [task]    Joriy vazifa (null — vazifa yo'q).
 * @property {number}      [tokens]  To'plangan tokenlar soni.
 * @property {number}      [progress] Bajarilish foizi (0..100).
 */

const now = () =>
  new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Bitta hodisaning asosiy maydonlarini (state/task/tokens/progress) agentga
// qo'llovchi sof funksiya. `applyEvent` ham, lokal simulyatsiya ham shu orqali
// yozadi — ya'ni yagona kirish nuqtasi mantiqi bitta joyda.
function applyCore(agent, event) {
  return {
    ...agent,
    state: event.type,
    task: event.task !== undefined ? event.task : agent.task,
    tokens: event.tokens !== undefined ? event.tokens : agent.tokens,
    progress: event.progress !== undefined ? event.progress : agent.progress,
  };
}

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

  // ── Yagona kirish nuqtasi ──────────────────────────────────
  // Har qanday manba (sim / ws) bitta hodisani shu funksiya orqali qo'llaydi.
  /** @param {AgentEvent} event */
  applyEvent: (event) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === event.agentId ? applyCore(a, event) : a)),
    })),

  // Lokal simulyatsiya bir qadami: holat mashinasini snapshot ustida hisoblab,
  // asosiy maydonlarni `applyEvent` orqali, sim-ichki maydonlarni (logs,
  // stateTimer) va statistikani alohida yozadi. Ko'rinadigan xatti-harakat
  // avvalgidek — faqat yozuv yagona kirish nuqtasi orqali o'tadi.
  tick: () => {
    const { pushEvent, spawnBeam, applyEvent, cleanBeams } = get();
    const snap = get().agents;

    let doneInc = 0, tokenInc = 0;
    const events = [];        // asosiy hodisalar → applyEvent
    const meta = {};          // id → { logs, stateTimer }
    const beamsToSpawn = [];  // { fromId, toId, color }
    const feedToPush = [];    // { agentName, verb, extra }

    for (const raw of snap) {
      const a = { ...raw, logs: [...raw.logs] };
      a.stateTimer -= 1.4;
      if (a.state === "working" || a.state === "collab") {
        a.progress = Math.min(100, a.progress + 6 + Math.random() * 10);
        const tk = Math.floor(200 + Math.random() * 900);
        a.tokens += tk; tokenInc += tk;
      }

      if (a.stateTimer <= 0) {
        switch (a.state) {
          case "idle": {
            a.task = a.tasks[Math.floor(Math.random() * a.tasks.length)];
            a.state = "thinking";
            a.progress = 0;
            a.stateTimer = 2.5 + Math.random() * 3;
            a.logs.unshift(`Vazifa: ${a.task}`);
            beamsToSpawn.push({ fromId: "hub", toId: a.id, color: "#3a8fe8" });
            feedToPush.push({ agentName: a.name, verb: EVENT_VERBS.assigned, extra: `— ${a.task}` });
            break;
          }
          case "thinking": {
            a.state = "working";
            a.stateTimer = 5 + Math.random() * 6;
            a.logs.unshift("Reja tayyor, bajarilmoqda");
            feedToPush.push({ agentName: a.name, verb: EVENT_VERBS.working, extra: "" });
            break;
          }
          case "working": {
            const r = Math.random();
            if (r < 0.12) {
              a.state = "blocked";
              a.stateTimer = 3 + Math.random() * 3;
              a.logs.unshift("To'siq: tashqi resurs javob bermayapti");
              feedToPush.push({ agentName: a.name, verb: EVENT_VERBS.blocked, extra: "· qayta urinish rejalashtirildi" });
            } else if (r < 0.28) {
              a.state = "review";
              a.stateTimer = 3 + Math.random() * 3;
              a.logs.unshift("Natija tasdiqqa yuborildi");
              feedToPush.push({ agentName: a.name, verb: EVENT_VERBS.review, extra: "" });
            } else if (r < 0.42) {
              const others = snap.filter((x) => x.id !== a.id && x.state === "working");
              if (others.length) {
                const b = others[Math.floor(Math.random() * others.length)];
                a.state = "collab";
                a.stateTimer = 3.5 + Math.random() * 3;
                a.logs.unshift(`${b.name} bilan kontekst almashinuvi`);
                beamsToSpawn.push({ fromId: a.id, toId: b.id, color: "#3a8fe8" });
                feedToPush.push({ agentName: a.name, verb: `${b.name} ${EVENT_VERBS.collab}`, extra: "" });
              } else a.stateTimer = 3;
            } else if (a.progress >= 96) {
              a.state = "idle";
              a.stateTimer = 2 + Math.random() * 4;
              a.logs.unshift(`Yakunlandi: ${a.task}`);
              beamsToSpawn.push({ fromId: a.id, toId: "hub", color: "#30d158" });
              feedToPush.push({ agentName: a.name, verb: EVENT_VERBS.done, extra: `— ${a.task}` });
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
      }

      a.logs = a.logs.slice(0, 5);
      events.push({ agentId: a.id, type: a.state, task: a.task, tokens: a.tokens, progress: a.progress });
      meta[a.id] = { logs: a.logs, stateTimer: a.stateTimer };
    }

    // 1) Asosiy maydonlar — yagona kirish nuqtasi orqali.
    events.forEach((ev) => applyEvent(ev));
    // 2) Sim-ichki maydonlar (logs, stateTimer) + statistika.
    set((s) => ({
      agents: s.agents.map((a) => {
        const m = meta[a.id];
        return m ? { ...a, logs: m.logs, stateTimer: m.stateTimer } : a;
      }),
      stats: { done: s.stats.done + doneInc, tokens: s.stats.tokens + tokenInc },
    }));
    // 3) Vizual yon ta'sirlar (tartib avvalgidek).
    beamsToSpawn.forEach((b) => spawnBeam(b.fromId, b.toId, b.color));
    feedToPush.forEach((f) => pushEvent(f.agentName, f.verb, f.extra));
    cleanBeams();
  },
}));

// Lokal simulyatsiya sikli. Transport `sim` rejimida shu ishlatiladi.
// App.jsx `startTransport()` ni chaqiradi; u config.SOURCE bo'yicha shuni
// yoki WebSocket manbasini tanlaydi — sim rejimida xatti-harakat o'zgarmagan.
export function startSimulation() {
  const iv = setInterval(() => useSim.getState().tick(), 1400);
  return () => clearInterval(iv);
}
