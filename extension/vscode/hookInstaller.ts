import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ── Claude Code hook o'rnatuvchisi ───────────────────────────
// ~/.claude/settings.json'dagi "hooks" bo'limiga bizning hook-skriptimizni
// qo'shadi (mavjudlarini buzmasdan). Faqat bizniki (aniq command yo'li bilan)
// olib tashlanadi.
//
// XAVFSIZLIK: fayl mavjud, lekin o'qib/parse qilib bo'lmasa (Claude o'zi
// yozayotganda yarim-yozuv, BOM, izohlar) — biz UMUMAN yozmaymiz. Aks holda
// foydalanuvchining barcha sozlamalari yo'qolishi mumkin edi. Yozuv atomik
// (temp + rename), shuning uchun o'quvchi hech qachon yarim-faylni ko'rmaydi.

const EVENTS = [
  "PreToolUse",
  "PostToolUse",
  // Tool XATO bilan tugaganda PostToolUse EMAS, shu event keladi (rasmiy hujjat).
  // Busiz hook rejimida "bloklandi" holati hech qachon ko'rinmas va xato bergan
  // tool indikatori navbat oxirigacha osilib qolardi.
  "PostToolUseFailure",
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

function defaultSettingsPath(): string {
  return path.join(os.homedir(), ".claude", "settings.json");
}

function hookCommand(hookScriptPath: string): string {
  return `node "${hookScriptPath}"`;
}

/** Bu bizning hookmi? Marker — o'ziga xos skript nomi (yo'l versiyadan versiyaga
 *  o'zgaradi, shuning uchun aynan yo'lga emas, faylga qaraymiz). Shu orqali eski
 *  versiyalarning yozuvlarini ham tozalab tashlaymiz. */
function isOurHook(command: unknown): boolean {
  return typeof command === "string" && command.includes("claude-hook.js");
}

/** Sozlamalarni o'qiydi. `readable=false` — fayl mavjud, lekin parse bo'lmadi
 *  (bunda YOZMASLIK kerak — ma'lumotni yo'qotmaslik uchun). Fayl yo'q yoki
 *  bo'sh bo'lsa `readable=true` + bo'sh obyekt (yangi fayl yaratish xavfsiz). */
function readSettings(settingsFile: string): { settings: Settings; readable: boolean } {
  if (!fs.existsSync(settingsFile)) return { settings: {}, readable: true };
  let text: string;
  try {
    text = fs.readFileSync(settingsFile, "utf8");
  } catch {
    return { settings: {}, readable: false }; // o'qib bo'lmadi — tegmaymiz
  }
  if (!text.trim()) return { settings: {}, readable: true }; // bo'sh fayl
  try {
    return { settings: JSON.parse(text) as Settings, readable: true };
  } catch {
    return { settings: {}, readable: false }; // buzuq JSON — TEGMAYMIZ
  }
}

/** Atomik yozuv — temp faylga yozib, so'ng rename. */
function writeSettingsAtomic(settingsFile: string, s: Settings): void {
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  const tmp = `${settingsFile}.agent-office-${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, settingsFile);
}

export function areHooksInstalled(hookScriptPath: string, settingsFile: string = defaultSettingsPath()): boolean {
  const { settings, readable } = readSettings(settingsFile);
  if (!readable || !settings.hooks) return false;
  const cmd = hookCommand(hookScriptPath);
  return EVENTS.every((e) =>
    (settings.hooks![e] || []).some((g) => (g.hooks || []).some((h) => h.command === cmd)),
  );
}

/** s.hooks'dan bizning BARCHA hooklarni (har qanday versiya yo'li) olib tashlaydi. */
function stripOurHooks(s: Settings): void {
  if (!s.hooks) return;
  for (const e of Object.keys(s.hooks)) {
    s.hooks[e] = (s.hooks[e] || [])
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurHook(h.command)) }))
      .filter((g) => (g.hooks || []).length > 0);
    if (s.hooks[e].length === 0) delete s.hooks[e];
  }
}

export function installHooks(hookScriptPath: string, settingsFile: string = defaultSettingsPath()): boolean {
  try {
    const { settings: s, readable } = readSettings(settingsFile);
    // Fayl mavjud lekin buzuq/o'qib bo'lmadi — UMUMAN yozmaymiz (ma'lumot yo'qotmaymiz).
    if (!readable) return false;
    if (!s.hooks) s.hooks = {};
    const before = JSON.stringify(s.hooks);
    // Bizning eski (boshqa versiya yo'lli) hooklarni tozalab, joriysini qo'shamiz —
    // versiya yangilanganda settings.json'da o'lik yozuvlar to'planmasin.
    stripOurHooks(s);
    const cmd = hookCommand(hookScriptPath);
    for (const e of EVENTS) {
      (s.hooks[e] || (s.hooks[e] = [])).push({ matcher: "*", hooks: [{ type: "command", command: cmd, timeout: 5 }] });
    }
    if (JSON.stringify(s.hooks) === before) return true; // o'zgarish yo'q — yozmaymiz (idempotent)
    writeSettingsAtomic(settingsFile, s);
    return true;
  } catch {
    return false;
  }
}

/** settings.json'da BIZNING hook (istalgan versiya yo'li) bormi — mavjud
 *  foydalanuvchini aniqlash uchun (rozilik so'rash faqat yangi o'rnatishda). */
export function hasOurHooks(settingsFile: string = defaultSettingsPath()): boolean {
  const { settings, readable } = readSettings(settingsFile);
  if (!readable || !settings.hooks) return false;
  return Object.values(settings.hooks).some((groups) =>
    (groups || []).some((g) => (g.hooks || []).some((h) => isOurHook(h.command))),
  );
}

/** Barqaror hook-skript joyi: ~/.agent-office/hooks/claude-hook.js. Kengaytma
 *  papkasi versiya bilan o'zgaradi (…/thomasarisu.agent-office-0.1.6/…) va
 *  yangilanish yoki o'chirishdan keyin yo'qoladi — settings.json'dagi buyruq
 *  esa o'sha o'lik yo'lga qarab qolar va Claude HAR tool'da "hook error"
 *  ko'rsatardi. Barqaror nusxa hech qachon yo'qolmaydi (server bo'lmasa jim
 *  exit 0 qiladi). */
export function stableHookScriptPath(): string {
  return path.join(os.homedir(), ".agent-office", "hooks", "claude-hook.js");
}

/** Kengaytmadagi skriptni barqaror joyga atomik nusxalaydi (faqat farq qilsa).
 *  Muvaffaqiyatli bo'lsa barqaror yo'lni, aks holda undefined qaytaradi. */
export function installStableHookScript(srcPath: string, dest: string = stableHookScriptPath()): string | undefined {
  try {
    const src = fs.readFileSync(srcPath);
    try {
      if (fs.readFileSync(dest).equals(src)) return dest; // allaqachon joriy
    } catch {
      /* hali yo'q */
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, src);
    fs.renameSync(tmp, dest);
    return dest;
  } catch {
    return undefined;
  }
}

/** PATH'da bajariladigan fayl bormi (child_process'siz — faqat fs). Claude
 *  hook'ni `node "…"` bilan ishga tushiradi; node bo'lmasa (masalan Claude
 *  native o'rnatilgan) har tool'da hook xatosi chiqardi. */
export function findOnPath(cmd: string, env: NodeJS.ProcessEnv = process.env, platform: string = process.platform): string | undefined {
  const raw = env.PATH ?? env.Path ?? "";
  const dirs = raw.split(platform === "win32" ? ";" : ":").filter(Boolean);
  const exts = platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean) : [""];
  for (const d of dirs) {
    for (const e of exts) {
      const p = path.join(d.replace(/^"|"$/g, ""), cmd + e.toLowerCase());
      try {
        if (fs.statSync(p).isFile()) return p;
      } catch {
        /* yo'q */
      }
    }
  }
  return undefined;
}

export function uninstallHooks(_hookScriptPath: string, settingsFile: string = defaultSettingsPath()): void {
  try {
    const { settings: s, readable } = readSettings(settingsFile);
    if (!readable || !s.hooks) return; // buzuq bo'lsa tegmaymiz
    stripOurHooks(s); // barcha versiyalarni oladi (marker bo'yicha)
    writeSettingsAtomic(settingsFile, s);
  } catch {
    /* ignore */
  }
}
