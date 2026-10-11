const { app, BrowserWindow } = require('electron');
const path = require('path');

// Keep Electron's runtime files in a location the application controls. This
// also avoids failures when the Windows profile directory is unavailable.
app.setPath('userData', path.join(__dirname, '../.electron-data'));
app.disableHardwareAcceleration();

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: 'CeramiSys ERP - نظام إدارة معرض السيراميك ومواد التشطيب',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.maximize();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
