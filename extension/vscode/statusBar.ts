import * as vscode from "vscode";
import { type AttentionAgent, needsAttention, statusText, summarize } from "../core/attention.js";

// ── Status bar ───────────────────────────────────────────────
// Ofis paneli YOPIQ bo'lsa ham agentlar holati ko'rinib tursin: nechta agent
// ishlayapti, nechtasi sizni kutmoqda. Bosilsa — panel ochiladi.
// Xarajat ATAYLAB yozilmaydi: narx hisobi webview'da (pricing.ts) — uni bu yerда
// takrorlash ikki manba yasaydi va ular vaqt o'tib bir-biriga mos kelmay qoladi.

export class OfficeStatusBar {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = "agent-office.showPanel";
  }

  /** Agentlar holatini status barда yangilaydi (agent yo'q → yashiriladi). */
  update(agents: (AttentionAgent & { folderName: string; stuck?: boolean; reason?: string })[]): void {
    const on = vscode.workspace.getConfiguration("agent-office").get<boolean>("statusBar", true);
    if (!on || agents.length === 0) {
      this.item.hide();
      return;
    }
    const a = summarize(agents);
    this.item.text = statusText(a);
    this.item.backgroundColor = needsAttention(a)
      ? new vscode.ThemeColor("statusBarItem.warningBackground")
      : undefined;

    const md = new vscode.MarkdownString();
    md.appendMarkdown("**Agent Office**\n\n");
    for (const g of agents) {
      const state = g.blocked ? "⛔ bloklangan" : g.permissionActive ? (g.stuck ? "🙋 uzoq kutmoqda" : "🔔 ruxsat kutmoqda") : "🟢 ishlamoqda";
      // Bloklangan bo'lsa SABABI ham ko'rinsin — status barga qarabоq bilinadi.
      const why = g.blocked && g.reason ? ` — _${g.reason.slice(0, 90)}_` : "";
      md.appendMarkdown(`- ${g.folderName} — ${state}${why}\n`);
    }
    md.appendMarkdown("\n_Ofisni ochish uchun bosing_");
    this.item.tooltip = md;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
