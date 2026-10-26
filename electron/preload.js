const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ceramisys', {
  savePdf: (html, fileName, landscape) => ipcRenderer.invoke('export:pdf', { html, fileName, landscape }),
  db: {
    load: () => ipcRenderer.invoke('db:load'),
    save: (bytes) => ipcRenderer.invoke('db:save', bytes),
    backup: (label) => ipcRenderer.invoke('db:backup', label),
    preserveCorrupt: () => ipcRenderer.invoke('db:preserve-corrupt'),
    createFreshAfterRecovery: () => ipcRenderer.invoke('db:create-fresh-after-recovery'),
    info: () => ipcRenderer.invoke('db:info'),
  },
  credentials: {
    get: () => ipcRenderer.invoke('credentials:get'),
    set: (username, password) => ipcRenderer.invoke('credentials:set', { username, password }),
    clear: () => ipcRenderer.invoke('credentials:clear'),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openFolder: (target) => ipcRenderer.invoke('app:openFolder', target),
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
    requestShutdown: () => ipcRenderer.invoke('app:requestShutdown'),
    onBeforeClose: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('app:before-close', handler);
      return () => ipcRenderer.removeListener('app:before-close', handler);
    },
    notifyCloseReady: () => ipcRenderer.send('app:close-ready'),
  },
  printing: {
    listPrinters: () => ipcRenderer.invoke('print:listPrinters'),
    raw: (bytes, printerName, options) => ipcRenderer.invoke('print:raw', {
      bytes: Array.from(bytes || []),
      printerName,
      transport: options?.transport,
      host: options?.host,
      port: options?.port,
    }),
    rawCups: (bytes, printerName) => ipcRenderer.invoke('print:rawCups', { bytes: Array.from(bytes || []), printerName }),
  },
});
