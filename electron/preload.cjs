const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vd", {
  installUpdate: () => ipcRenderer.send("vd:install-update"),
  onUpdateStatus: (cb) => ipcRenderer.on("vd:update-status", (_e, s) => cb(s)),
});
