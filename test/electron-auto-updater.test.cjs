const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  configureAutoUpdater,
  createRollbackBackup,
  isUpdatePlatform,
  toPublicUpdate,
} = require('../electron/autoUpdater');
const packageConfig = require('../package.json');

function createUpdaterContext({ packaged = true, platform = 'win32', appImagePath = '' } = {}) {
  const updater = new EventEmitter();
  let checkCount = 0;
  updater.checkForUpdates = () => {
    checkCount++;
    return Promise.resolve({ isUpdateAvailable: true });
  };
  updater.quitAndInstall = (...args) => { updater.installArgs = args; };
  const handlers = new Map();
  const sent = [];
  const win = {
    isDestroyed: () => false,
    webContents: { send: (...args) => sent.push(args) },
  };
  let installRequests = 0;
  const controller = configureAutoUpdater({
    app: { isPackaged: packaged, getVersion: () => '1.1.4' },
    updater,
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    validateIpcSender: (event) => {
      if (event?.trusted !== true) throw new Error('Unauthorized IPC caller');
    },
    getWindow: () => win,
    onInstallRequested: () => { installRequests++; },
    platform,
    appImagePath,
    checkIntervalMs: 60_000,
  });
  return {
    updater,
    handlers,
    sent,
    win,
    controller,
    getCheckCount: () => checkCount,
    getInstallRequests: () => installRequests,
  };
}

test('auto-updates are restricted to packaged apps and supported targets', () => {
  assert.equal(isUpdatePlatform('linux', ''), false);
  assert.equal(isUpdatePlatform('linux', '/path/to/appimage'), true);
  assert.equal(isUpdatePlatform('win32', ''), true);
  assert.equal(isUpdatePlatform('darwin', ''), true);

  const context = createUpdaterContext({ packaged: false });
  try {
    assert.equal(context.updater.autoDownload, undefined);
    assert.equal(context.controller.getStatus().status, 'idle');
  } finally {
    context.controller.dispose();
  }
});

test('packaged app checks automatically, downloads in the background, and waits for install approval', async () => {
  const context = createUpdaterContext();
  try {
    const { updater, handlers, sent, controller } = context;
    assert.equal(updater.autoDownload, true);
    assert.equal(updater.autoInstallOnAppQuit, false);
    assert.equal(updater.allowDowngrade, true);

    updater.emit('update-available', {
      version: '1.1.5',
      releaseName: 'Bug fixes',
      releaseNotes: '<!-- mandatory -->\n- Fixes',
    });
    assert.equal(controller.getStatus().status, 'downloading');
    assert.equal(controller.getStatus().mandatory, true);
    assert.equal(controller.getStatus().releaseNotes, '- Fixes');

    updater.emit('download-progress', { percent: 45.7 });
    assert.equal(controller.getStatus().progress, 45.7);
    updater.emit('update-downloaded', {
      version: '1.1.5',
      releaseName: 'Bug fixes',
      releaseNotes: '- Fixes',
    });
    assert.equal(controller.getStatus().status, 'downloaded');
    assert.equal(controller.getStatus().progress, 100);
    assert.ok(sent.length >= 3);

    const checkCount = context.getCheckCount();
    await handlers.get('app:update-check')({ trusted: true });
    assert.equal(context.getCheckCount(), checkCount, 'a ready update is not replaced by a later check');

    assert.throws(() => handlers.get('app:update-install')({ trusted: false }), /Unauthorized/);
    await handlers.get('app:update-install')({ trusted: true });
    assert.equal(context.getInstallRequests(), 1);
    assert.equal(controller.installNow(), true);
    assert.deepEqual(updater.installArgs, [false, true]);
  } finally {
    context.controller.dispose();
  }
});

test('failed update checks are surfaced for retry and public release notes are bounded', async () => {
  const context = createUpdaterContext();
  try {
    context.updater.checkForUpdates = () => Promise.reject(new Error('offline'));
    const state = await context.handlers.get('app:update-check')({ trusted: true });
    assert.equal(state.status, 'error');
    assert.match(state.error, /offline/);
    assert.equal(context.handlers.get('app:update-status')({ trusted: true }).status, 'error');
    assert.throws(() => context.handlers.get('app:update-status')({ trusted: false }), /Unauthorized/);
  } finally {
    context.controller.dispose();
  }

  const info = toPublicUpdate({
    version: '1.1.5',
    releaseName: '[mandatory] Critical fix',
    releaseNotes: 'x'.repeat(20_050),
  }, '1.1.4');
  assert.equal(info.mandatory, true);
  assert.equal(info.releaseName, 'Critical fix');
  assert.equal(info.releaseNotes.length, 20_000);
});

test('desktop release builds require signing and target configured update channels', () => {
  assert.equal(packageConfig.build.win.forceCodeSigning, true);
  assert.equal(packageConfig.build.win.verifyUpdateCodeSignature, true);
  assert.equal(packageConfig.build.mac.forceCodeSigning, true);
  assert.equal(packageConfig.build.publish[0].provider, 'github');
  for (const scriptName of [
    'electron:publish:x64',
    'electron:publish:mac',
    'electron:publish:linux',
  ]) {
    const script = packageConfig.scripts[scriptName];
    assert.ok(script.indexOf('bundle:secure') >= 0, `${scriptName} must regenerate bytecode`);
    assert.ok(
      script.indexOf('bundle:secure') < script.indexOf('--publish always'),
      `${scriptName} must generate bytecode before publishing`,
    );
  }
  assert.match(packageConfig.scripts['electron:publish:mac'], /--mac --publish always/);
  assert.match(packageConfig.scripts['electron:publish:linux'], /--linux --publish always/);
});

test('rollback backup preserves the saved database and removes incomplete copies', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-update-'));
  const source = path.join(directory, 'database.enc');
  const bytes = Buffer.from('encrypted database bytes');
  await fs.writeFile(source, bytes);
  try {
    const backupPath = await createRollbackBackup({
      fs,
      path,
      dbFile: source,
      backupDir: directory,
      version: '1.1.4',
    });
    assert.match(path.basename(backupPath), /^ceramisys_pre-update_1\.1\.4_.*\.sqlite\.enc$/);
    assert.deepEqual(await fs.readFile(backupPath), bytes);

    const failingFs = new Proxy(fs, {
      get(target, property) {
        if (property === 'copyFile') {
          return async (_from, to) => {
            await fs.writeFile(to, 'partial');
            throw new Error('simulated copy failure');
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    await assert.rejects(createRollbackBackup({
      fs: failingFs,
      path,
      dbFile: source,
      backupDir: directory,
      version: '1.1.4',
    }), /simulated copy failure/);
    assert.deepEqual(
      (await fs.readdir(directory)).filter((name) => name.endsWith('.tmp')),
      [],
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
