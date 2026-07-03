// ── Electron preload ─────────────────────────────────────────
// Renderer (React) uchun xavfsiz IPC ko'prigi. window.agentOffice orqali
// main process funksiyalari chaqiriladi (contextIsolation yoqilgan).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentOffice", {
  isElectron: true,
  // Papka tanlash → tanlangan yo'l (yoki null)
  openProject: () => ipcRenderer.invoke("project:open"),
});
