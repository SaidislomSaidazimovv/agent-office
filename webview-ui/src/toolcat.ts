// ── Tool turkumlash (sof) ────────────────────────────────────
// Tool yorlig'idan ("Edit x.ts", "Bash npm test") ish turkumini aniqlaydi.
// Alohida modul — story.ts VA store.ts ikkalasi ishlatadi (aylanma import yo'q).

export type ToolCat = "edit" | "read" | "test" | "run" | "research" | "other";

export const TOOL_CATS: ToolCat[] = ["edit", "read", "test", "run", "research", "other"];

/** Tool yorlig'idan turkumni aniqlaydi. */
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
