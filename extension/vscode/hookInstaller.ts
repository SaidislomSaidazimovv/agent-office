import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ── Claude Code hook o'rnatuvchisi ───────────────────────────
// ~/.claude/settings.json'даги "hooks" bo'limiga bizning hook-skriptимизни
// qo'shadi (mavjudларини buzmasdan). Faqat bizniki (aniq command yo'li bilan)
// olib tashlanadi.

const EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "Notification",
  "SessionStart",
  "SessionEnd",
  "SubagentStop",
  "UserPromptSubmit",
];

interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
}
interface HookGroup {
  matcher?: string;
  hooks: HookEntry[];
}
interface Settings {
  hooks?: Record<string, HookGroup[]>;
  [k: string]: unknown;
}

function settingsPath(): string {
  return path.join(os.homedir(), ".claude", "settings.json");
}

function hookCommand(hookScriptPath: string): string {
  return `node "${hookScriptPath}"`;
}

function readSettings(): Settings {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8")) as Settings;
  } catch {
    return {};
  }
}

export function areHooksInstalled(hookScriptPath: string): boolean {
  const s = readSettings();
  if (!s.hooks) return false;
  const cmd = hookCommand(hookScriptPath);
  return EVENTS.every((e) =>
    (s.hooks![e] || []).some((g) => (g.hooks || []).some((h) => h.command === cmd)),
  );
}

export function installHooks(hookScriptPath: string): boolean {
  try {
    // Allaqачон o'rnatilган — foydalanuvchi settings.json'иga tegmaymiz.
    if (areHooksInstalled(hookScriptPath)) return true;
    const s = readSettings();
    if (!s.hooks) s.hooks = {};
    const cmd = hookCommand(hookScriptPath);
    for (const e of EVENTS) {
      const groups = s.hooks[e] || (s.hooks[e] = []);
      const already = groups.some((g) => (g.hooks || []).some((h) => h.command === cmd));
      if (!already) {
        groups.push({ matcher: "*", hooks: [{ type: "command", command: cmd, timeout: 5 }] });
      }
    }
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function uninstallHooks(hookScriptPath: string): void {
  try {
    const s = readSettings();
    if (!s.hooks) return;
    const cmd = hookCommand(hookScriptPath);
    for (const e of Object.keys(s.hooks)) {
      s.hooks[e] = (s.hooks[e] || [])
        .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => h.command !== cmd) }))
        .filter((g) => (g.hooks || []).length > 0);
      if (s.hooks[e].length === 0) delete s.hooks[e];
    }
    fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
  } catch {
    /* ignore */
  }
}
