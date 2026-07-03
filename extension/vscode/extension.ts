import * as vscode from "vscode";
import { installHooks, uninstallHooks } from "./hookInstaller.js";
import { OfficeViewProvider, VIEW_ID } from "./OfficeViewProvider.js";

// ── Extension kirish nuqtasi ─────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  const version = (context.extension.packageJSON as { version?: string }).version ?? "0.0.0";
  const provider = new OfficeViewProvider(context.extensionUri, version);
  provider.activate();

  const hookScript = vscode.Uri.joinPath(context.extensionUri, "dist", "hooks", "claude-hook.js").fsPath;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider),
    vscode.commands.registerCommand("agent-office.showPanel", () => {
      vscode.commands.executeCommand("agent-office.panelView.focus");
    }),
    vscode.commands.registerCommand("agent-office.installHooks", () => {
      const ok = installHooks(hookScript);
      vscode.window.showInformationMessage(
        ok ? "Agent Office: Claude hook'lari o'rnatildi." : "Agent Office: hook o'rnatib bo'lmadi.",
      );
    }),
    vscode.commands.registerCommand("agent-office.uninstallHooks", () => {
      uninstallHooks(hookScript);
      vscode.window.showInformationMessage("Agent Office: Claude hook'lari olib tashlandi.");
    }),
    { dispose: () => provider.dispose() },
  );

  const autoShow = vscode.workspace
    .getConfiguration("agent-office")
    .get<boolean>("autoShowPanel", false);
  if (autoShow) {
    vscode.commands.executeCommand("agent-office.panelView.focus");
  }
}

export function deactivate(): void {
  /* subscriptions dispose qiladi */
}
