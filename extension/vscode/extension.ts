import * as vscode from "vscode";
import { OfficeViewProvider, VIEW_ID } from "./OfficeViewProvider.js";

// ── Extension kirish nuqtasi ─────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  const version = (context.extension.packageJSON as { version?: string }).version ?? "0.0.0";
  const provider = new OfficeViewProvider(context.extensionUri, version);
  provider.activate();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider),
    vscode.commands.registerCommand("agent-office.showPanel", () => {
      vscode.commands.executeCommand("agent-office.panelView.focus");
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
