const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ceramisys', {
  savePdf: (html, fileName, landscape) => ipcRenderer.invoke('export:pdf', { html, fileName, landscape }),
  db: {
    load: () => ipcRenderer.invoke('db:load'),
    save: (bytes) => ipcRenderer.invoke('db:save', bytes),
    decryptLocalBackup: (bytes) => ipcRenderer.invoke('db:decrypt-local-backup', bytes),
    encryptXlsxBackup: (bytes, password) => ipcRenderer.invoke('db:encrypt-xlsx-backup', bytes, password),
    decryptXlsxBackup: (bytes, password) => ipcRenderer.invoke('db:decrypt-xlsx-backup', bytes, password),
    backup: (label) => ipcRenderer.invoke('db:backup', label),
    removeBackup: (fileName) => ipcRenderer.invoke('db:remove-backup', fileName),
    preserveCorrupt: () => ipcRenderer.invoke('db:preserve-corrupt'),
    createFreshAfterRecovery: () => ipcRenderer.invoke('db:create-fresh-after-recovery'),
    info: () => ipcRenderer.invoke('db:info'),
  },
  credentials: {
    get: () => ipcRenderer.invoke('credentials:get'),
    set: (username, password) => ipcRenderer.invoke('credentials:set', { username, password }),
    clear: () => ipcRenderer.invoke('credentials:clear'),
  },
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    pushEvents: (events) => ipcRenderer.invoke('sync:push', events),
    pullEvents: (scope, cursor, limit) => ipcRenderer.invoke('sync:pull', scope, cursor, limit),
    getClientConfig: () => ipcRenderer.invoke('sync:client-config:get'),
    saveClientConfig: (config) => ipcRenderer.invoke('sync:client-config:save', config),
    clearClientConfig: () => ipcRenderer.invoke('sync:client-config:clear'),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openFolder: (target) => ipcRenderer.invoke('app:openFolder', target),
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
    requestShutdown: () => ipcRenderer.invoke('app:requestShutdown'),
    onBeforeClose: (callback) => {
      const handler = (_event, request) => callback(request?.requestId);
      ipcRenderer.on('app:before-close', handler);
      return () => ipcRenderer.removeListener('app:before-close', handler);
    },
    notifyCloseReady: (requestId, result) => ipcRenderer.send('app:close-ready', { ...result, requestId }),
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
  documents: {
    importFile: () => ipcRenderer.invoke('documents:import'),
    openFile: (storageName) => ipcRenderer.invoke('documents:open', storageName),
    info: () => ipcRenderer.invoke('documents:info'),
  },
});
