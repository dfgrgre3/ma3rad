const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ceramisys', {
  savePdf: (html, fileName, landscape) => ipcRenderer.invoke('export:pdf', { html, fileName, landscape }),
  db: {
    load: () => ipcRenderer.invoke('db:load'),
    save: (bytes) => ipcRenderer.invoke('db:save', bytes),
    backup: (label) => ipcRenderer.invoke('db:backup', label),
    info: () => ipcRenderer.invoke('db:info'),
  },
  credentials: {
    get: () => ipcRenderer.invoke('credentials:get'),
    set: (username, password) => ipcRenderer.invoke('credentials:set', { username, password }),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openFolder: (target) => ipcRenderer.invoke('app:openFolder', target),
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
  server: {
    start: (port) => ipcRenderer.invoke('server:start', { port }),
    stop: () => ipcRenderer.invoke('server:stop'),
    status: () => ipcRenderer.invoke('server:status'),
  },
  remoteDb: {
    onRequest: (cb) => {
      const listener = (_event, envelope) => {
        Promise.resolve()
          .then(() => cb(envelope.payload))
          .then(
            (result) => ipcRenderer.send('remote-db:response', { id: envelope.id, result }),
            (error) => ipcRenderer.send('remote-db:response', { id: envelope.id, result: { error: String(error?.message || error) } })
          );
      };
      ipcRenderer.on('remote-db:request', listener);
      return () => ipcRenderer.removeListener('remote-db:request', listener);
    },
  },
});
