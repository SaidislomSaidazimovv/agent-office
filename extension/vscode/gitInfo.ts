import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

// ── Git xabardorligi ─────────────────────────────────────────
// Agent papkasining branch'i + o'zgargan fayllar soni. XAVFSIZLIK: hech qanday
// `child_process` / `git` chaqiruvi YO'Q — faqat (1) VS Code Git extension API
// yoki (2) `.git/HEAD` ni oddiy fayl sifatida o'qish.

export interface GitInfo {
  branch?: string;
  /** Working-tree + index o'zgarishlari soni (API mavjud bo'lsa). */
  changed: number;
}

interface GitRepoState { HEAD?: { name?: string }; workingTreeChanges?: unknown[]; indexChanges?: unknown[] }
interface GitRepo { rootUri: vscode.Uri; state: GitRepoState }
interface GitAPI { repositories: GitRepo[] }

let cachedApi: GitAPI | null | undefined;
function gitApi(): GitAPI | null {
  if (cachedApi !== undefined) return cachedApi;
  try {
    const ext = vscode.extensions.getExtension<{ getAPI(v: number): GitAPI }>("vscode.git");
    cachedApi = ext?.exports?.getAPI ? ext.exports.getAPI(1) : null;
  } catch {
    cachedApi = null;
  }
  return cachedApi;
}

/** `.git/HEAD` dan branch nomi (detached bo'lsa qisqa SHA). child_process yo'q. */
export function readGitBranch(fsPath: string): string | undefined {
  try {
    let dir = fsPath;
    for (let i = 0; i < 10; i++) {
      const head = path.join(dir, ".git", "HEAD");
      if (fs.existsSync(head)) {
        const t = fs.readFileSync(head, "utf8").trim();
        const m = t.match(/ref:\s*refs\/heads\/(.+)$/);
        return m ? m[1] : t.slice(0, 7); // detached HEAD → qisqa sha
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

const norm = (p: string) => p.replace(/[\\/]+$/, "").toLowerCase();

/** Papka uchun git ma'lumoti — avval VS Code Git API (branch + o'zgarishlar),
 *  aks holda `.git/HEAD` (faqat branch). Git yo'q bo'lsa undefined. */
export function gitInfoForPath(fsPath: string): GitInfo | undefined {
  const api = gitApi();
  if (api) {
    // cwd shu repo ildizi ostidagi eng chuqur mos repo.
    let best: GitRepo | undefined;
    const target = norm(fsPath);
    for (const r of api.repositories) {
      const root = norm(r.rootUri.fsPath);
      if (target === root || target.startsWith(root + "/") || target.startsWith(root + "\\")) {
        if (!best || root.length > norm(best.rootUri.fsPath).length) best = r;
      }
    }
    if (best) {
      return {
        branch: best.state.HEAD?.name,
        changed: (best.state.workingTreeChanges?.length ?? 0) + (best.state.indexChanges?.length ?? 0),
      };
    }
  }
  const branch = readGitBranch(fsPath);
  return branch ? { branch, changed: 0 } : undefined;
}
