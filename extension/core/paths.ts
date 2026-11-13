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

/** Hook bergan `transcript_path` ishonchli transcript yo'limi: mutlaq, `.jsonl`,
 *  va ~/.claude/projects ICHIDA (boshqa ixtiyoriy faylni kuzatmaymiz). Ha bo'lsa
 *  yo'lni qaytaradi — slug taxmin qilishdan aniqroq (Claude uzun yo'llarni
 *  boshqacha slug qilishi mumkin). */
export function trustedTranscriptPath(p: unknown): string | undefined {
  if (typeof p !== "string" || !p.endsWith(".jsonl") || !path.isAbsolute(p)) return undefined;
  const norm = (s: string) => {
    const t = path.resolve(s).replace(/[\\/]+/g, "/").replace(/\/+$/, "");
    return process.platform === "win32" ? t.toLowerCase() : t;
  };
  const root = norm(claudeProjectsRoot());
  const file = norm(p);
  return file.startsWith(root + "/") ? path.resolve(p) : undefined;
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
