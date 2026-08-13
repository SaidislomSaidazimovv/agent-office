import { fmtDur, fmtTok } from "./format";
import type { Key } from "./i18n";
import { cacheStats, fmtCost } from "./pricing";
import { roleKeyFor } from "./scene/roles";
import { type AgentView, displayName } from "./store";

// ── Sessiya hikoyasi ─────────────────────────────────────────
// Har agent NIMA qilganini o'qiladigan hikoya qilib beradi — HAMMASI o'lchangan
// holatdan (tool tarixi, navbat, xarajat, sub-agentlar, xato). Hech narsa to'qib
// chiqarilmaydi. Sof funksiya (DOM'siz) → test qilinadi; til UI'da qo'llanadi.

export type ToolCat = "edit" | "read" | "test" | "run" | "research" | "other";

/** Tool yorlig'idan ("Edit x.ts", "Bash npm test") turkumni aniqlaydi. */
export function toolCat(label: string): ToolCat {
  const w = (label.split(/\s+/)[0] || "").toLowerCase();
  if (["edit", "write", "multiedit", "notebookedit"].includes(w)) return "edit";
  if (["read", "grep", "glob", "ls", "notebookread"].includes(w)) return "read";
  if (["websearch", "webfetch"].includes(w)) return "research";
  if (w === "bash") {
    return /\b(test|jest|vitest|pytest|go test|npm t|rspec|phpunit|cargo test|mocha)\b/.test(label.toLowerCase()) ? "test" : "run";
  }
  return "other";
}

export interface AgentStory {
  id: number;
  name: string;
  roleKey: string;
  model?: string;
  /** Boshlang'ich vazifa (birinchi prompt) — agent NIMA qilishga kelgani. */
  task?: string;
  /** Faol vaqt (ms). */
  ms: number;
  turns: number;
  tools: number;
  /** So'nggi tool tarixidan turkum bo'yicha taqsimot (ko'pdan kamga). */
  cats: { cat: ToolCat; n: number }[];
  subagents: number;
  /** NEGA bloklangan (agar hozir bloklangan bo'lsa). */
  blockedReason?: string;
  cost: number;
  tokens: number;
  /** Kesh necha % tejadi (0..100; manfiy bo'lsa 0). */
  cacheSavedPct: number;
}

/** Hikoyani o'qiladigan markdown hujjatga aylantiradi (.md saqlash uchun). Sof
 *  funksiya — `t` tashqaridan (StoryPanel bilan bir xil kalitlar). Har qator
 *  o'lchangan holatdan; hech narsa to'qib chiqarilmaydi. */
export function storyMarkdown(stories: AgentStory[], t: (k: Key) => string): string {
  const L = (k: string) => t(k as Key);
  const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
  const out: string[] = [`# ${L("story.title")}`, ""];
  if (stories.length === 0) { out.push(L("dash.noData"), ""); return out.join("\n"); }
  for (const s of stories) {
    out.push(`## ${oneLine(s.name)} — ${L(`role.${s.roleKey}`)}${s.model ? ` · ${s.model}` : ""}`, "");
    if (s.task) out.push(`- 📋 ${oneLine(s.task)}`);
    out.push(s.tools > 0 || s.turns > 0
      ? `- ⏱ ${fmtDur(s.ms)} ${L("story.worked")} · ${s.tools} ${L("story.toolsN")} · ${s.turns} ${L("story.turnsN")}`
      : `- ${L("story.quietOne")}`);
    const mostly = s.cats.slice(0, 3).map((c) => `${L(`story.cat.${c.cat}`)} (${c.n})`).join(" · ");
    if (mostly) out.push(`- 🧰 ${L("story.mostly")} ${mostly}`);
    if (s.subagents > 0) out.push(`- 🌳 ${s.subagents} ${L("story.subHired")}`);
    if (s.blockedReason) out.push(`- ⛔ ${L("story.blockedNow")}: ${oneLine(s.blockedReason)}`);
    if (s.cost > 0) out.push(`- 💰 ~${fmtCost(s.cost)} · ${fmtTok(s.tokens)} ${L("insp.output")}${s.cacheSavedPct > 0 ? ` · ♻️ ${s.cacheSavedPct}% ${L("story.cacheSaved")}` : ""}`);
    out.push("");
  }
  return out.join("\n");
}

export function buildStory(agents: AgentView[], now: number): AgentStory[] {
  return agents.map((a) => {
    const counts = new Map<ToolCat, number>();
    for (const h of a.toolHistory) {
      const c = toolCat(h.label);
      if (c === "other") continue; // "other"ni hikoyada ko'rsatmaymiz
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const cats = [...counts.entries()]
      .map(([cat, n]) => ({ cat, n }))
      .sort((x, y) => y.n - x.n);
    const cs = cacheStats(a.model, a.billed);
    return {
      id: a.id,
      name: displayName(a),
      roleKey: roleKeyFor(a.role, a.seatIndex),
      model: a.model,
      task: a.task,
      ms: a.activeMs + (a.activeSince != null ? now - a.activeSince : 0),
      turns: a.turns,
      tools: a.toolCalls,
      cats,
      subagents: a.subagents.length,
      blockedReason: a.blocked ? a.blockedReason : undefined,
      cost: a.costUsd,
      tokens: a.inputTokens + a.outputTokens,
      cacheSavedPct: cs.naive > 0 ? Math.max(0, Math.round(((cs.naive - cs.actual) / cs.naive) * 100)) : 0,
    };
  }).sort((x, y) => y.tools - x.tools); // eng band agent birinchi
}
