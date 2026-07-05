import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ── Claude Code transcript yo'llari ──────────────────────────

/** ~/.claude/projects — barcha sessiya papkalari shu yerda. */
export function claudeProjectsRoot(): string {
  return path.join(os.homedir(), ".claude", "projects");
}

/** Ish papkasini Claude konvensiyasiga slug qiladi:
 *  har [a-zA-Z0-9-]dan tashqari belgi "-" ga. */
export function normalizeProjectPath(absPath: string): string {
  return absPath.replace(/[^a-zA-Z0-9-]/g, "-");
}

/** Berilgan ish papkasi uchun sessiya papkasini topadi.
 *  Windows'da katta-kichik harf farqli fallback bilan. */
export function getSessionDir(workspacePath: string): string {
  const root = claudeProjectsRoot();
  const dirName = normalizeProjectPath(workspacePath);
  const exact = path.join(root, dirName);
  if (fs.existsSync(exact)) return exact;
  try {
    const match = fs
      .readdirSync(root)
      .find((c) => c.toLowerCase() === dirName.toLowerCase());
    if (match) return path.join(root, match);
  } catch {
    /* root yo'q */
  }
  return exact; // hali yaratilmagan bo'lishi mumkin
}
