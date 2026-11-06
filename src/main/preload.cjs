const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pulse', Object.freeze({
  getSnapshot: (range) => ipcRenderer.invoke('pulse:snapshot', range),
  onSnapshot: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('pulse:update', handler);
    return () => ipcRenderer.removeListener('pulse:update', handler);
  },
  onSettings: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('pulse:settings-update', handler);
    return () => ipcRenderer.removeListener('pulse:settings-update', handler);
  },
  refresh: (options) => ipcRenderer.invoke('pulse:refresh', options),
  getSettings: () => ipcRenderer.invoke('pulse:settings'),
  saveSettings: (patch) => ipcRenderer.invoke('pulse:save-settings', patch),
  action: (name) => ipcRenderer.invoke('pulse:action', name),
}));
