const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");

// Writable data lives in userData (the packaged app dir is read-only).
process.env.VD_DATA_DIR = path.join(app.getPath("userData"), "data");
// Avoid clashing with a dev server on 8787.
const PORT = process.env.PORT || "8788";
process.env.PORT = PORT;

// Boot the bundled Express server (API + static web/dist) in-process.
require(path.join(__dirname, "..", "server", "dist", "server.cjs"));

function createWindow(route = "") {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: "Vibedesign",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    ...(process.platform === "darwin" ? { trafficLightPosition: { x: 14, y: 16 } } : {}),
    backgroundColor: "#faf9f5",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // External links open in the system browser, not in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Popups the app opens itself with self-contained content: presenter /
    // audience windows (blob: URLs) and the print-to-PDF window
    // (window.open("") → about:blank). Denying these silently breaks Present
    // and Share → PDF in the packaged desktop app; they work in the browser.
    if (url === "" || url === "about:blank" || url.startsWith("blob:")) return { action: "allow" };
    let target;
    try {
      target = new URL(url);
    } catch {
      return { action: "deny" };
    }
    const internalHost = target.hostname === "localhost" || target.hostname === "127.0.0.1";
    if (target.protocol === "http:" && internalHost && target.port === PORT) return { action: "allow" };
    if (target.protocol === "https:" || target.protocol === "mailto:") {
      void shell.openExternal(target.href).catch(() => {});
    }
    return { action: "deny" };
  });

  // Give the embedded server a beat to bind before loading.
  setTimeout(() => win.loadURL(`http://127.0.0.1:${PORT}${route}`), 300);
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

ipcMain.on("vd:open-project-window", (_event, projectId) => {
  if (typeof projectId !== "string" || !/^[\w-]+$/.test(projectId)) return;
  createWindow(`/#/p/${projectId}`);
});

// ---- Auto update (user-triggered from the 更新日志 card) ----------------------
ipcMain.on("vd:install-update", async (event) => {
  const send = (s) => event.sender.send("vd:update-status", s);
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = false;
    autoUpdater.on("download-progress", (p) => send(`下载中 ${Math.round(p.percent)}%`));
    autoUpdater.on("update-downloaded", () => {
      send("重启安装中…");
      setImmediate(() => autoUpdater.quitAndInstall());
    });
    autoUpdater.on("error", (err) => send(`更新失败：${String(err).slice(0, 80)}`));
    const info = await autoUpdater.checkForUpdates();
    if (info?.updateInfo) {
      send("开始下载…");
      await autoUpdater.downloadUpdate();
    } else {
      send("已是最新版本");
    }
  } catch (err) {
    send(`更新失败：${String(err).slice(0, 80)}`);
  }
});
