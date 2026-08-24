const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vd", {
  platform: process.platform,
  openProjectWindow: (projectId) => ipcRenderer.send("vd:open-project-window", projectId),
  openPresenter: (html) => ipcRenderer.send("vd:open-presenter", html),
  openArtifactWindow: (html) => ipcRenderer.send("vd:open-artifact-window", html),
  selectDirectory: () => ipcRenderer.invoke("vd:select-directory"),
  installUpdate: () => ipcRenderer.send("vd:install-update"),
  onUpdateStatus: (cb) => ipcRenderer.on("vd:update-status", (_e, s) => cb(s)),
});
