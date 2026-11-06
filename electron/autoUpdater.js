const { randomBytes } = require('node:crypto');
const fsConstants = require('node:fs').constants;

function isUpdatePlatform(platform, appImagePath) {
  return platform === 'win32' || platform === 'darwin' || (platform === 'linux' && Boolean(appImagePath));
}

async function createRollbackBackup({ fs, path, dbFile, backupDir, version }) {
  const stat = await fs.stat(dbFile);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error('The saved database is not available for a pre-update backup.');
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(
    backupDir,
    `ceramisys_pre-update_${version}_${stamp}_${randomBytes(4).toString('hex')}.sqlite.enc`,
  );
  const temporaryPath = `${backupPath}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    await fs.copyFile(dbFile, temporaryPath, fsConstants.COPYFILE_EXCL);
    const backupStat = await fs.stat(temporaryPath);
    if (backupStat.size !== stat.size) throw new Error('The pre-update database backup is incomplete.');
    await fs.rename(temporaryPath, backupPath);
    return backupPath;
  } catch (error) {
    try { await fs.unlink(temporaryPath); } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') {
        throw new Error(`Could not clean up an incomplete pre-update backup: ${cleanupError.message || cleanupError}`);
      }
    }
    throw error;
  }
}

function getReleaseNotes(info) {
  const notes = info?.releaseNotes;
  if (typeof notes === 'string') return notes;
  if (Array.isArray(notes)) {
    return notes
      .map((item) => typeof item?.note === 'string' ? item.note : '')
      .filter(Boolean)
      .join('\n\n');
  }
  return '';
}

function toPublicUpdate(info, currentVersion) {
  const releaseNotes = getReleaseNotes(info).slice(0, 20_000);
  const releaseName = typeof info?.releaseName === 'string' ? info.releaseName : '';
  const mandatory = /^\s*\[mandatory\]/i.test(releaseName)
    || /<!--\s*mandatory\s*-->/i.test(releaseNotes);
  return {
    currentVersion,
    version: typeof info?.version === 'string' ? info.version : '',
    releaseName: releaseName.replace(/^\s*\[mandatory\]\s*/i, ''),
    releaseNotes: releaseNotes.replace(/<!--\s*mandatory\s*-->/gi, '').trim(),
    mandatory,
  };
}

function configureAutoUpdater({
  app,
  updater,
  ipcMain,
  validateIpcSender = () => {},
  getWindow = () => null,
  onInstallRequested = () => {},
  platform = process.platform,
  appImagePath = process.env.APPIMAGE,
  checkIntervalMs = 6 * 60 * 60 * 1000,
}) {
  const currentVersion = app.getVersion();
  const updatesSupported = app.isPackaged && isUpdatePlatform(platform, appImagePath);
  let state = { status: updatesSupported ? 'idle' : 'unsupported', currentVersion };
  let client = updater;
  let checkTimer;

  const publish = (nextState) => {
    state = { ...state, ...nextState, currentVersion };
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('app:update-status', state);
    }
    return state;
  };

  const registerHandlers = () => {
    if (!ipcMain) return;
    ipcMain.handle('app:update-status', (event) => {
      validateIpcSender(event);
      return state;
    });
    ipcMain.handle('app:update-check', async (event) => {
      validateIpcSender(event);
      if (!client || ['unsupported', 'checking', 'downloading', 'downloaded'].includes(state.status)) return state;
      publish({ status: 'checking', error: undefined });
      try {
        await client.checkForUpdates();
        return state;
      } catch (error) {
        publish({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
        return state;
      }
    });
    ipcMain.handle('app:update-install', (event) => {
      validateIpcSender(event);
      if (state.status !== 'downloaded') {
        throw new Error('The update is not ready to install.');
      }
      onInstallRequested();
      return { ok: true };
    });
  };

  registerHandlers();
  if (!updatesSupported) {
    return {
      getStatus: () => state,
      installNow: () => false,
      dispose: () => clearInterval(checkTimer),
    };
  }

  client = client || require('electron-updater').autoUpdater;
  client.autoDownload = true;
  client.autoInstallOnAppQuit = false;
  client.allowDowngrade = false;
  client.fullChangelog = true;
  client.on('checking-for-update', () => publish({ status: 'checking', error: undefined }));
  client.on('update-available', (info) => publish({
    ...toPublicUpdate(info, currentVersion),
    status: 'downloading',
    progress: 0,
    error: undefined,
  }));
  client.on('update-not-available', () => publish({
    status: 'not-available',
    version: undefined,
    releaseName: undefined,
    releaseNotes: undefined,
    mandatory: false,
    progress: undefined,
    error: undefined,
  }));
  client.on('download-progress', (progress) => publish({
    status: 'downloading',
    progress: Number.isFinite(progress?.percent)
      ? Math.max(0, Math.min(100, progress.percent))
      : 0,
  }));
  client.on('update-downloaded', (info) => publish({
    ...toPublicUpdate(info, currentVersion),
    status: 'downloaded',
    progress: 100,
    error: undefined,
  }));
  client.on('error', (error) => {
    console.error('[updater] Update check or download failed:', error);
    publish({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const checkForUpdates = () => {
    if (['checking', 'downloading', 'downloaded'].includes(state.status)) return;
    publish({ status: 'checking', error: undefined });
    void client.checkForUpdates().catch((error) => {
      console.error('[updater] Could not check for updates:', error);
      publish({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };
  checkForUpdates();
  checkTimer = setInterval(checkForUpdates, checkIntervalMs);
  checkTimer.unref?.();

  return {
    getStatus: () => state,
    installNow: () => {
      if (state.status !== 'downloaded') return false;
      client.quitAndInstall(false, true);
      return true;
    },
    dispose: () => clearInterval(checkTimer),
  };
}

module.exports = {
  configureAutoUpdater,
  createRollbackBackup,
  getReleaseNotes,
  isUpdatePlatform,
  toPublicUpdate,
};
