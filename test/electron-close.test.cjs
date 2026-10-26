const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { installGracefulClose } = require('../electron/gracefulShutdown');

function createWindow() {
  const win = new EventEmitter();
  win.destroyed = false;
  win.webContents = {
    send: () => {},
  };
  win.isDestroyed = () => win.destroyed;
  win.close = () => {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    win.emit('close', event);
    if (!event.prevented) win.destroyed = true;
  };
  win.destroy = () => { win.destroyed = true; };
  return win;
}

function triggerClose(win) {
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  win.emit('close', event);
  assert.equal(event.prevented, true, 'the initial close is held pending the save result');
}

function waitFor(predicate) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - startedAt > 1000) {
        clearInterval(timer);
        reject(new Error('Timed out waiting for shutdown state'));
      }
    }, 5);
  });
}

test('successful save closes normally without force-destroying the window', async () => {
  const win = createWindow();
  const ipcMain = new EventEmitter();
  win.webContents.send = (_channel, request) =>
    ipcMain.emit('app:close-ready', { sender: win.webContents }, { ...request, ok: true });
  const dialog = { showMessageBox: async () => { throw new Error('dialog should not be shown'); } };
  installGracefulClose({ win, ipcMain, dialog, validateIpcSender: () => {}, timeoutMs: 100 });

  triggerClose(win);
  await waitFor(() => win.destroyed);
  assert.equal(ipcMain.listenerCount('app:close-ready'), 0);
});

test('save failure can be retried and only closes after a successful confirmation', async () => {
  const win = createWindow();
  const ipcMain = new EventEmitter();
  let attempts = 0;
  win.webContents.send = (_channel, request) => {
    attempts++;
    ipcMain.emit(
      'app:close-ready',
      { sender: win.webContents },
      {
        ...request,
        ...(attempts === 1 ? { ok: false, error: 'disk write failed' } : { ok: true }),
      },
    );
  };
  const dialog = { showMessageBox: async (_window, options) => {
    assert.equal(options.buttons[0], 'إعادة المحاولة');
    return { response: 0 };
  } };
  installGracefulClose({ win, ipcMain, dialog, validateIpcSender: () => {}, timeoutMs: 100 });

  triggerClose(win);
  await waitFor(() => win.destroyed);
  assert.equal(attempts, 2);
});

test('save timeout leaves the window open when the user cancels closing', async () => {
  const win = createWindow();
  const ipcMain = new EventEmitter();
  let dialogShown = false;
  const dialog = { showMessageBox: async (_window, options) => {
    assert.deepEqual(options.buttons, ['إعادة المحاولة', 'إلغاء الإغلاق', 'إغلاق قسري']);
    dialogShown = true;
    return { response: 1 };
  } };
  installGracefulClose({ win, ipcMain, dialog, validateIpcSender: () => {}, timeoutMs: 10 });

  triggerClose(win);
  await waitFor(() => dialogShown);
  assert.equal(win.destroyed, false);
});

test('a late response from a slow disk write cannot authorize a later close attempt', async () => {
  const win = createWindow();
  const ipcMain = new EventEmitter();
  const requests = [];
  win.webContents.send = (_channel, request) => requests.push(request.requestId);
  let dialogCalls = 0;
  const dialog = { showMessageBox: async () => {
    dialogCalls++;
    return { response: dialogCalls === 1 ? 0 : 1 };
  } };
  installGracefulClose({ win, ipcMain, dialog, validateIpcSender: () => {}, timeoutMs: 10 });

  triggerClose(win);
  await waitFor(() => requests.length === 2);
  ipcMain.emit(
    'app:close-ready',
    { sender: win.webContents },
    { requestId: requests[0], ok: true },
  );
  assert.equal(win.destroyed, false, 'the timed-out attempt must not close the window');
  ipcMain.emit(
    'app:close-ready',
    { sender: win.webContents },
    { requestId: requests[1], ok: true },
  );
  await waitFor(() => win.destroyed);
});

test('force close destroys the window only after explicit user selection', async () => {
  const win = createWindow();
  const ipcMain = new EventEmitter();
  const dialog = { showMessageBox: async () => ({ response: 2 }) };
  installGracefulClose({ win, ipcMain, dialog, validateIpcSender: () => {}, timeoutMs: 10 });

  triggerClose(win);
  await waitFor(() => win.destroyed);
  assert.equal(ipcMain.listenerCount('app:close-ready'), 0);
});

test('confirmation from a different renderer cannot authorize closing', async () => {
  const win = createWindow();
  const ipcMain = new EventEmitter();
  const otherWebContents = {};
  const dialog = { showMessageBox: async () => ({ response: 1 }) };
  installGracefulClose({ win, ipcMain, dialog, validateIpcSender: () => {}, timeoutMs: 10 });

  triggerClose(win);
  ipcMain.emit('app:close-ready', { sender: otherWebContents }, { requestId: 1, ok: true });
  await waitFor(() => ipcMain.listenerCount('app:close-ready') === 0);
  assert.equal(win.destroyed, false);
});
