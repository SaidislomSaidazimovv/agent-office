// ── Agent rolini terminal faoliyatidan avtomatik aniqlash ────────────
// Foydalanuvchi rol tanlamaydi — agent nima ustida ishlayotgani (tahrirlagan
// fayl kengaytmasi + Bash buyrug'i + tool turi) bo'yicha rol ballanadi.
// Yozish (Edit/Write) o'qishdan og'irroq. Ishonch chegarasidan (>=4 ball va 2
// ball ustunlik) o'tganda rol o'rnatiladi; ungacha undefined → seat-fallback.

const EXT_ROLE: Record<string, string> = {
  tsx: "frontend", jsx: "frontend", vue: "frontend", svelte: "frontend",
  css: "frontend", scss: "frontend", sass: "frontend", less: "frontend", html: "frontend",
  go: "backend", py: "backend", rs: "backend", rb: "backend", php: "backend",
  java: "backend", kt: "backend", cs: "backend", sql: "backend",
  md: "docs", mdx: "docs", rst: "docs", adoc: "docs",
  csv: "data", ipynb: "data", parquet: "data",
};

const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

interface RoleCarrier {
  role?: string;
  roleScores: Record<string, number>;
}

/** Bitta tool hodisasidan rol ballarini yig'adi. Rol O'ZGARSA — yangi rolni
 *  qaytaradi (broadcast qilinsin), aks holda null. */
export function accumulateRole(
  agent: RoleCarrier,
  name: string,
  input: Record<string, unknown> | undefined,
): string | null {
  const s = agent.roleScores;
  const add = (role: string, w: number) => { s[role] = (s[role] ?? 0) + w; };

  const fpRaw = input && (input.file_path ?? input.path ?? input.notebook_path);
  if (typeof fpRaw === "string" && fpRaw) {
    const fp = fpRaw.toLowerCase();
    const w = WRITE_TOOLS.has(name) ? 3 : 1;
    if (/\.(test|spec)\.|__tests__|(^|[\\/])tests?[\\/]/.test(fp)) add("qa", w + 1);
    else {
      const ext = fp.includes(".") ? fp.slice(fp.lastIndexOf(".") + 1) : "";
      const role = EXT_ROLE[ext];
      if (role) add(role, w);
    }
  }

  if (name === "Bash") {
    const cmd = input && typeof input.command === "string" ? input.command.toLowerCase() : "";
    if (cmd) {
      if (/\b(jest|vitest|pytest|mocha|rspec|phpunit)\b|\bgo test\b|\bnpm (run )?test\b/.test(cmd)) add("qa", 2);
      else if (/\b(psql|prisma|sqlite3|createdb|migrate|alembic)\b/.test(cmd)) add("backend", 2);
      else if (/\b(jupyter|pandas|dvc)\b/.test(cmd)) add("data", 2);
    }
  }

  if (name === "WebSearch" || name === "WebFetch") add("research", 1);

  // G'olibni tanlash — ishonch chegarasi bilan.
  let best: string | null = null, bestS = 0, second = 0;
  for (const r in s) {
    const v = s[r];
    if (v > bestS) { second = bestS; bestS = v; best = r; }
    else if (v > second) second = v;
  }
  if (best && bestS >= 4 && bestS - second >= 2 && agent.role !== best) {
    agent.role = best;
    return best;
  }
  return null;
}
