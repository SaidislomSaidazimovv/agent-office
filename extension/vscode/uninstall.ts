// ── Kengaytma o'chirilganda (VS Code `vscode:uninstall` skripti) ──
// VS Code kengaytma TO'LIQ o'chirilgandan keyin (qayta ishga tushganda) shu
// skriptni Node bilan bir marta ishga tushiradi. Biz ~/.claude/settings.json'dan
// FAQAT o'zimizning hook yozuvlarini olib tashlaymiz (boshqa sozlamalarga
// tegmaymiz; fayl buzuq bo'lsa umuman yozmaymiz — uninstallHooks shunday).
// Foydalanuvchi ma'lumoti (~/.agent-office: tarix, nomlar, layout) SAQLANADI.

import * as fs from "node:fs";
import { stableHookScriptPath, uninstallHooks } from "./hookInstaller.js";

uninstallHooks("");
try {
  fs.rmSync(stableHookScriptPath(), { force: true });
} catch {
  /* ignore */
}
