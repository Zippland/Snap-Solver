const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("snap", {
  state: () => ipcRenderer.invoke("snap:state"),
  refreshCode: () => ipcRenderer.invoke("snap:refresh-code"),
  selectNetwork: (address) => ipcRenderer.invoke("snap:network", address),
  revoke: (id) => ipcRenderer.invoke("snap:revoke", id),
  pause: (value) => ipcRenderer.invoke("snap:pause", value),
  permission: () => ipcRenderer.invoke("snap:permission"),
  testCapture: () => ipcRenderer.invoke("snap:test-capture"),
  copyAddress: () => ipcRenderer.invoke("snap:copy"),
  openPhonePreview: () => ipcRenderer.invoke("snap:preview"),
  quit: () => ipcRenderer.invoke("snap:quit"),
});
