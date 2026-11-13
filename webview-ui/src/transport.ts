import type { ClientMessage, ServerMessage } from "./protocol";

// ── Transport (VS Code webview postMessage YOKI standalone WebSocket) ──
// VS Code ichida: acquireVsCodeApi().postMessage; xabarlar window 'message'
// hodisasi orqali keladi. Standalone brauzerda (CLI serveri): WebSocket.

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

// ── WebSocket (faqat VS Code'dan tashqarida) ──
let ws: WebSocket | undefined;
let wsReady = false;
const outQueue: ClientMessage[] = [];
const wsHandlers = new Set<(m: ServerMessage) => void>();

if (!vscode && typeof window !== "undefined" && typeof WebSocket !== "undefined" && location.protocol.startsWith("http")) {
  try {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onopen = () => {
      wsReady = true;
      for (const m of outQueue) ws!.send(JSON.stringify(m));
      outQueue.length = 0;
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data as string) as ServerMessage;
        wsHandlers.forEach((h) => h(m));
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      const wasOpen = wsReady;
      wsReady = false;
      // CLI qayta ishga tushirildi / uzildi — har 2s'da qayta urinamiz. Server
      // qayta ishga tushganda agent ID'lari 0dan boshlanadi, shuning uchun eski
      // holat bilan aralashtirmasdan sahifani TO'LIQ qayta yuklaymiz (toza snapshot).
      if (wasOpen) reconnectThenReload(proto);
    };
  } catch {
    ws = undefined;
  }
}

/** Standalone CLI uzilganda: server qaytguncha har 2s'da tekshiradi, qaytgach reload. */
function reconnectThenReload(proto: string): void {
  const attempt = () => {
    let probe: WebSocket;
    try {
      probe = new WebSocket(`${proto}://${location.host}`);
    } catch {
      setTimeout(attempt, 2000);
      return;
    }
    let opened = false;
    probe.onopen = () => {
      opened = true;
      probe.close();
      location.reload();
    };
    probe.onerror = () => {
      /* onclose keyin keladi */
    };
    probe.onclose = () => {
      if (!opened) setTimeout(attempt, 2000);
    };
  };
  setTimeout(attempt, 2000);
}

export function send(msg: ClientMessage): void {
  if (vscode) {
    vscode.postMessage(msg);
  } else if (ws) {
    if (wsReady) ws.send(JSON.stringify(msg));
    else outQueue.push(msg);
  }
}

export function onMessage(handler: (msg: ServerMessage) => void): () => void {
  // window 'message' — VS Code postMessage VA dev/test injektsiyasi.
  const listener = (e: MessageEvent) => handler(e.data as ServerMessage);
  window.addEventListener("message", listener);
  // WebSocket — standalone brauzer.
  wsHandlers.add(handler);
  return () => {
    window.removeEventListener("message", listener);
    wsHandlers.delete(handler);
  };
}

/** VS Code webview ichidami (aks holda standalone brauzer). */
export const isVsCode = !!vscode;
