import type { ClientMessage, ServerMessage } from "./protocol";

// ── Transport (VS Code webview postMessage) ──────────────────
// Kelajakda standalone brauzer uchun WebSocketTransport qo'shsa bo'ladi.

interface VsCodeApi {
  postMessage(msg: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let vscode: VsCodeApi | undefined;
try {
  vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;
} catch {
  vscode = undefined;
}

export function send(msg: ClientMessage): void {
  vscode?.postMessage(msg);
}

export function onMessage(handler: (msg: ServerMessage) => void): () => void {
  const listener = (e: MessageEvent) => handler(e.data as ServerMessage);
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

/** Standalone (brauzer, VS Code emas) rejimda test uchun. */
export const isVsCode = !!vscode;
