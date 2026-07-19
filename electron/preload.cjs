const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vd", {
  platform: process.platform,
  openProjectWindow: (projectId) => ipcRenderer.send("vd:open-project-window", projectId),
  installUpdate: () => ipcRenderer.send("vd:install-update"),
  onUpdateStatus: (cb) => ipcRenderer.on("vd:update-status", (_e, s) => cb(s)),
});
