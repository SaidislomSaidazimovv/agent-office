// ── Electron main process ────────────────────────────────────
// Oynani yaratadi, dev'da Vite serverini (localhost:5173), prod'da dist/ ni
// yuklaydi. "Loyihani ochish" (papka tanlash) IPC handler shu yerda.
// Keyingi bosqichlar (S2-A auth, S2-B Agent SDK runner) ham shu jarayonда bo'ladi.
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0d1015",
    title: "Agent Office",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── IPC: "Loyihani ochish" — papka tanlash dialogi ──
ipcMain.handle("project:open", async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: "Loyiha papkasini tanlang",
    properties: ["openDirectory"],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});
