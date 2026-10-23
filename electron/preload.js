const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ceramisys', {
  savePdf: (html, fileName, landscape) => ipcRenderer.invoke('export:pdf', { html, fileName, landscape }),
  db: {
    load: () => ipcRenderer.invoke('db:load'),
    save: (bytes) => ipcRenderer.invoke('db:save', bytes),
    backup: (label) => ipcRenderer.invoke('db:backup', label),
    info: () => ipcRenderer.invoke('db:info'),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openFolder: (target) => ipcRenderer.invoke('app:openFolder', target),
  },
});
