import * as vscode from "vscode";
import { OfficeViewProvider, VIEW_ID } from "./OfficeViewProvider.js";

// ── Extension kirish nuqtasi ─────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  const version = (context.extension.packageJSON as { version?: string }).version ?? "0.0.0";
  const provider = new OfficeViewProvider(context.extensionUri, version, context.globalState);
  provider.activate();

  context.subscriptions.push(
    // retainContextWhenHidden: panel yashiringanda webview o'chmaydi —
    // boshqa oynaga o'tib qaytganda holat 0dan boshlanmaydi.
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("agent-office.showPanel", () => {
      vscode.commands.executeCommand("agent-office.panelView.focus");
    }),
    vscode.commands.registerCommand("agent-office.showDiagnostics", () => {
      provider.log.show(true);
    }),
    vscode.commands.registerCommand("agent-office.installHooks", async () => {
      const ok = await provider.installHooksCommand();
      vscode.window.showInformationMessage(provider.t(ok ? "hooks.installed" : "hooks.installFailed"));
    }),
    vscode.commands.registerCommand("agent-office.uninstallHooks", async () => {
      // Rad etish saqlanadi — keyingi ishga tushishda hook'lar QAYTA YOZILMAYDI.
      await provider.uninstallHooksCommand();
      vscode.window.showInformationMessage(provider.t("hooks.removed"));
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
