// ── Tool turkumlash (host, sof) ──────────────────────────────
// Tool nomi/yorlig'idan ("Edit x.ts", "Bash npm test") ish turkumini aniqlaydi.
// Webview'dagi webview-ui/src/toolcat.ts bilan BIR XIL (ikki alohida build —
// messages/protocol kabi qo'lda sinxron). Host har tool_use'ni HAQIQIY nomi
// bilan sanaydi (tarixiy + jonli), snapshot'da webview'ga yuboriladi.

export type ToolCat = "edit" | "read" | "test" | "run" | "research" | "other";

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
