const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tanuki", {
  onStatus: (cb) => ipcRenderer.on("status", (_e, s) => cb(s)),
  onTuck: (cb) => ipcRenderer.on("tuck", (_e, v) => cb(v)),
  setTucked: (v) => ipcRenderer.send("tucked", !!v),
  setHover: (over) => ipcRenderer.send("hover", over),
  dragStart: () => ipcRenderer.send("drag-start"),
  dragMove: (dx, dy) => ipcRenderer.send("drag-move", dx, dy),
  dragEnd: () => ipcRenderer.send("drag-end"),
  resizeStart: () => ipcRenderer.send("resize-start"),
  resizeMove: (dx, dy) => ipcRenderer.send("resize-move", dx, dy),
  resizeEnd: () => ipcRenderer.send("resize-end"),
  resizeReset: () => ipcRenderer.send("resize-reset"),
  contextMenu: () => ipcRenderer.send("context-menu"),
});
