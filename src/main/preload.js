const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tanuki", {
  onStatus: (cb) => ipcRenderer.on("status", (_e, s) => cb(s)),
  setHover: (over) => ipcRenderer.send("hover", over),
  dragStart: () => ipcRenderer.send("drag-start"),
  dragMove: (dx, dy) => ipcRenderer.send("drag-move", dx, dy),
  dragEnd: () => ipcRenderer.send("drag-end"),
  contextMenu: () => ipcRenderer.send("context-menu"),
});
