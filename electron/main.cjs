const { app, BrowserWindow, shell, ipcMain, dialog } = require("electron");
const path = require("path");

// Packaged flow validation reuses Electron's bundled Chromium through CDP.
// This child never starts the Vibedesign server or opens a visible window.
if (process.argv.includes("--vd-validation-browser")) {
  app.disableHardwareAcceleration();
  let validationWindow;
  app.whenReady().then(() => {
    validationWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    void validationWindow.loadURL("about:blank");
  });
  const printPort = Number(process.argv.find((arg) => arg.startsWith("--vd-print-port="))?.split("=")[1]);
  const printToken = process.argv.find((arg) => arg.startsWith("--vd-print-token="))?.slice("--vd-print-token=".length);
  if (Number.isInteger(printPort) && printPort > 0 && printToken) {
    const printServer = require("node:http").createServer((req, res) => {
      if (req.method !== "POST" || req.url !== "/print" || req.headers.authorization !== `Bearer ${printToken}`) {
        res.writeHead(403).end("forbidden");
        return;
      }
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1024) req.destroy();
      });
      req.on("end", () => {
        if (!validationWindow || validationWindow.isDestroyed()) {
          res.writeHead(503).end("browser unavailable");
          return;
        }
        let width;
        let height;
        try {
          ({ width, height } = JSON.parse(body));
        } catch {
          res.writeHead(400).end("invalid request");
          return;
        }
        if (!Number.isFinite(width) || !Number.isFinite(height)) {
          res.writeHead(400).end("invalid page size");
          return;
        }
        void validationWindow.webContents.printToPDF({
          printBackground: true,
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          pageSize: {
            width: Math.max(0.01, Math.min(200, width / 96)),
            height: Math.max(0.01, Math.min(200, height / 96)),
          },
        }).then(
          (buffer) => res.writeHead(200, { "content-type": "application/pdf" }).end(buffer),
          (error) => res.writeHead(500).end(String(error)),
        );
      });
    });
    printServer.listen(printPort, "127.0.0.1");
    printServer.unref();
  }
  app.on("window-all-closed", () => app.quit());
// MCP stdio mode: coding agents spawn the app binary with `--vd-mcp` (see
// server/src/agentInstall.ts resolveLaunch). Run the bundled MCP server and
// skip the GUI entirely — this is what makes "one-click agent connect" work
// from the packaged app (the bundle inside asar is requireable from here).
} else if (process.argv.includes("--vd-mcp")) {
  require(path.join(__dirname, "..", "server", "dist", "mcp.cjs"));
} else {
// Writable data lives in userData (the packaged app dir is read-only).
process.env.VD_DATA_DIR = path.join(app.getPath("userData"), "data");
if (app.isPackaged) process.env.VD_ELECTRON_VALIDATION_EXECUTABLE = process.execPath;
// Avoid clashing with a dev server on 8787.
const PORT = process.env.PORT || "8788";
process.env.PORT = PORT;

const MAX_PRESENTER_HTML_BYTES = 8 * 1024 * 1024;
const MAX_ARTIFACT_HTML_BYTES = 8 * 1024 * 1024;

function isTrustedAppMainFrame(event) {
  const frame = event.senderFrame;
  if (frame && frame !== event.sender.mainFrame) return false;
  const senderUrl = frame?.url || event.sender.getURL();
  try {
    const target = new URL(senderUrl);
    return target.protocol === "http:" && target.hostname === "127.0.0.1" && target.port === PORT;
  } catch {
    return false;
  }
}

function createPresenterWindow(html) {
  const partition = `vd-presenter-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const webPreferences = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    partition,
  };
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "Vibedesign Presenter",
    backgroundColor: "#0c0d10",
    webPreferences,
  });

  // The presenter is app-generated, but it renders model/user-authored slide
  // HTML. Keep it in a separate sandboxed session with no preload bridge.
  win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // Only the trusted presenter shell may open its audience window. Slide
    // documents are sandboxed without allow-popups, so they cannot reach here.
    if (frameName === "vd-audience" && url.startsWith("blob:")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1280,
          height: 720,
          backgroundColor: "#000000",
          webPreferences: { ...webPreferences },
        },
      };
    }
    return { action: "deny" };
  });
  win.webContents.on("did-create-window", (child) => {
    child.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    child.webContents.on("will-navigate", (event) => event.preventDefault());
  });
  // Load a blank document first, then write the trusted presenter shell from
  // the main process. This avoids large data: URLs while keeping authored slide
  // markup out of the privileged editor renderer.
  const source = `document.open();document.write(${JSON.stringify(html)});document.close();`;
  void win
    .loadURL("about:blank")
    .then(async () => {
      win.webContents.on("will-navigate", (event) => event.preventDefault());
      await win.webContents.executeJavaScript(source, true);
      if (!win.isDestroyed()) win.show();
    })
    .catch(() => {
      if (!win.isDestroyed()) win.close();
    });
}

function createArtifactWindow(html) {
  const partition = `vd-artifact-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    show: false,
    title: "Vibedesign Preview",
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      partition,
    },
  });

  // Generic authored HTML gets its own sandboxed renderer and session. It has
  // no opener, preload bridge, Node access, permissions, downloads, or ability
  // to create more application windows.
  win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  win.webContents.session.on("will-download", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.protocol === "https:" || target.protocol === "mailto:") {
        void shell.openExternal(target.href).catch(() => {});
      }
    } catch {
      // Ignore malformed or relative popup targets.
    }
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url === "about:blank") return;
    event.preventDefault();
    try {
      const target = new URL(url);
      if (target.protocol === "https:" || target.protocol === "mailto:") {
        void shell.openExternal(target.href).catch(() => {});
      }
    } catch {
      // Authored relative/script navigation stays blocked.
    }
  });

  const source = `document.open();document.write(${JSON.stringify(html)});document.close();`;
  void win
    .loadURL("about:blank")
    .then(async () => {
      await win.webContents.executeJavaScript(source, true);
      if (!win.isDestroyed()) win.show();
    })
    .catch(() => {
      if (!win.isDestroyed()) win.close();
    });
}

// Boot the bundled Express server (API + static web/dist) in-process.
require(path.join(__dirname, "..", "server", "dist", "server.cjs"));

function createWindow(route = "") {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: "Vibedesign",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    ...(process.platform === "darwin" ? { trafficLightPosition: { x: 14, y: 16 } } : {}),
    backgroundColor: "#faf9f5",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // Renderer-created content windows are denied. Intentional presenter windows
  // are created in the main process through vd:open-presenter with an isolated
  // session and no preload bridge; PDF export uses the headless render API.
  win.webContents.setWindowOpenHandler(({ url }) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      return { action: "deny" };
    }
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

ipcMain.on("vd:open-presenter", (event, html) => {
  if (!isTrustedAppMainFrame(event)) return;
  if (typeof html !== "string" || !html.trim()) return;
  if (Buffer.byteLength(html, "utf8") > MAX_PRESENTER_HTML_BYTES) return;
  createPresenterWindow(html);
});

ipcMain.on("vd:open-artifact-window", (event, html) => {
  if (!isTrustedAppMainFrame(event)) return;
  if (typeof html !== "string" || !html.trim()) return;
  if (Buffer.byteLength(html, "utf8") > MAX_ARTIFACT_HTML_BYTES) return;
  createArtifactWindow(html);
});

ipcMain.handle("vd:select-directory", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  return result.canceled ? null : result.filePaths[0] ?? null;
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
}
