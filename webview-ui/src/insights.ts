import { cacheStats } from "./pricing";
import { CONTEXT_HOT } from "./scene/emotes";
import { type AgentView, type CostSample, displayName } from "./store";

// ── Xulosalar dvigateli (deterministik "zukkolik") ───────────
// Extension BARCHA sessiyalarni ko'radi — shuning uchun bitta Claude sessiyasi
// bilmaydigan narsalarni aytadi: masalan ikki agent BIR faylni tahrirlayotgani
// (to'qnashuv xavfi), yoki bir tool takror-takror ishlatilayotgani (sikl). AI
// EMAS — hammasi o'lchangan holatdan, sof mantiq. Hech narsa to'qib chiqarilmaydi.

export type InsightLevel = "warn" | "info" | "good";
export interface Insight {
  id: string;
  level: InsightLevel;
  icon: string;
  /** i18n kaliti (matn UI'da `{x}` o'rniga vars qo'yiladi). */
  key: string;
  vars?: Record<string, string | number>;
  /** Bog'liq agentlar (bosilsa tanlash uchun). */
  agentIds?: number[];
}

const EDIT_TOOLS = ["edit", "write", "multiedit", "notebookedit"];
/** "Edit store.ts" → "store.ts" (faqat tahrir toollari). */
export function editedFile(label: string): string | null {
  const parts = label.trim().split(/\s+/);
  const w = (parts[0] || "").toLowerCase();
  if (!EDIT_TOOLS.includes(w) || parts.length < 2) return null;
  const f = parts[parts.length - 1];
  return f || null;
}

const RECENT_EDITS = 6; // har agentning so'nggi shuncha tahriri hisobga olinadi
const LOOP_N = 4; // bir yorliq ketma-ket shuncha marta → sikl shubhasi

const LEVEL_RANK: Record<InsightLevel, number> = { warn: 0, info: 1, good: 2 };

export function buildInsights(agents: AgentView[], samples: CostSample[], now: number): Insight[] {
  const out: Insight[] = [];
  const active = agents.filter((a) => a.status !== "idle");

  // 1) TO'QNASHUV — bir REPO (folderName) ichida bir faylni bir nechta agent
  //    tahrirlayotgan bo'lsa. Extension buni ko'radi, alohida Claude ko'rmaydi.
  const fileAgents = new Map<string, Set<number>>(); // `${repo}::${file}` → id'lar
  const fileName = new Map<string, string>();
  for (const a of agents) {
    const recent = new Set<string>();
    const labels = [a.toolLabel, ...a.toolHistory.map((h) => h.label)].filter(Boolean) as string[];
    for (const l of labels.slice(0, RECENT_EDITS + 1)) {
      const f = editedFile(l);
      if (f) recent.add(f);
    }
    for (const f of recent) {
      const k = `${a.folderName}::${f}`;
      if (!fileAgents.has(k)) { fileAgents.set(k, new Set()); fileName.set(k, f); }
      fileAgents.get(k)!.add(a.id);
    }
  }
  for (const [k, ids] of fileAgents) {
    if (ids.size >= 2) {
      out.push({ id: `conflict-${k}`, level: "warn", icon: "⚠️", key: "insight.conflict", vars: { n: ids.size, file: fileName.get(k)! }, agentIds: [...ids] });
    }
  }

  // 2) SIKL — agentning so'nggi LOOP_N yorlig'i bir xil (bir joyda qotib qolish
  //    yoki qayta-qayta muvaffaqiyatsiz test).
  for (const a of agents) {
    const h = a.toolHistory;
    if (h.length >= LOOP_N) {
      const top = h[0].label;
      if (h.slice(0, LOOP_N).every((x) => x.label === top)) {
        out.push({ id: `loop-${a.id}`, level: "warn", icon: "🔁", key: "insight.loop", vars: { name: displayName(a), tool: top, n: LOOP_N }, agentIds: [a.id] });
      }
    }
  }

  // 3) BLOKLANGAN — sabab bilan
  for (const a of agents) {
    if (a.blocked && a.blockedReason) {
      out.push({ id: `blocked-${a.id}`, level: "warn", icon: "⛔", key: "insight.blocked", vars: { name: displayName(a), reason: a.blockedReason }, agentIds: [a.id] });
    }
  }

  // 3b) KONTEKST TO'LYAPTI — kirish tokenlari oyna chegarasiga yaqin. 🥵 emote
  //     atigi 6s ko'rinadi; bu esa TURG'UN signal (/compact kerakligini eslatadi).
  for (const a of agents) {
    if (a.contextWindow > 0 && a.inputTokens / a.contextWindow >= CONTEXT_HOT) {
      const pct = Math.round((a.inputTokens / a.contextWindow) * 100);
      out.push({ id: `ctx-${a.id}`, level: "warn", icon: "🌡️", key: "insight.contextHot", vars: { name: displayName(a), n: pct }, agentIds: [a.id] });
    }
  }

  // 4) SIZNI KUTAYOTGANLAR (ruxsat/tiqilgan)
  const waiting = agents.filter((a) => a.permission || a.stuck);
  if (waiting.length > 0) {
    out.push({ id: "waiting", level: "warn", icon: "🔔", key: "insight.waiting", vars: { n: waiting.length }, agentIds: waiting.map((a) => a.id) });
  }

  // 5) XARAJAT TEZLIGI — so'nggi ~1 daqiqada $/daq (namunalardan)
  if (samples.length >= 2) {
    const last = samples[samples.length - 1];
    let base = samples[0];
    for (let i = samples.length - 1; i >= 0; i--) { if (last.t - samples[i].t >= 55000) { base = samples[i]; break; } }
    const mins = (last.t - base.t) / 60000;
    if (mins > 0.2) {
      const rate = (last.cost - base.cost) / mins;
      if (rate >= 0.25) out.push({ id: "cost-rate", level: "info", icon: "📈", key: "insight.costFast", vars: { rate } });
    }
  }

  // 6) ENG BAND agent
  const busiest = [...agents].sort((a, b) => b.toolCalls - a.toolCalls)[0];
  if (busiest && busiest.toolCalls >= 8) {
    out.push({ id: "busiest", level: "info", icon: "🔥", key: "insight.busiest", vars: { name: displayName(busiest), n: busiest.toolCalls }, agentIds: [busiest.id] });
  }

  // 7) KESH SAMARADORLIGI — jami tejam ulushi (har agent o'z modeli narxida)
  let naive = 0, actual = 0, anyCache = false;
  for (const a of agents) {
    const cs = cacheStats(a.model, a.billed);
    naive += cs.naive; actual += cs.actual;
    if (a.billed.cacheRead > 0) anyCache = true;
  }
  if (anyCache && naive > 0) {
    const pct = Math.round(((naive - actual) / naive) * 100);
    if (pct >= 40) out.push({ id: "cache", level: "good", icon: "♻️", key: "insight.cacheGood", vars: { n: pct } });
  }

  // 8) HAMMASI JOYIDA — ogohlantirish yo'q bo'lsa
  if (!out.some((i) => i.level === "warn") && agents.length > 0) {
    out.push({ id: "calm", level: "good", icon: "✅", key: active.length > 0 ? "insight.calm" : "insight.allIdle" });
  }

  // Tartib: ogohlantirish → info → yaxshi (o'z ichida barqaror)
  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
}
