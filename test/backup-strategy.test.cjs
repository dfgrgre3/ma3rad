const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { apply321Strategy, checkExternalDrive } = require('../electron/backupStrategyService');

test('USB detection uses the discovered removable drive letter', async () => {
  const argsSeen = [];
  const drive = await checkExternalDrive({
    platform: 'win32',
    execFileImpl: (command, args, callback) => {
      argsSeen.push(...args);
      callback(null, 'E\r\nF\r\n');
    },
  });
  assert.equal(drive, 'E:\\');
  assert.ok(argsSeen.some((arg) => arg.includes('-ExpandProperty')));
  assert.ok(!argsSeen.some((arg) => arg.includes('–')));
});

test('3-2-1 strategy copies the encrypted local backup to USB and verifies its size', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-backup-strategy-'));
  try {
    const backupPath = path.join(root, 'ceramisys_daily_test.sqlite.enc');
    const bytes = Buffer.from('encrypted backup contents');
    await fs.writeFile(backupPath, bytes);
    const strategy = await apply321Strategy({
      BACKUP_DIR: path.join(root, 'local-backups'),
      backupPath,
      checkExternalDriveImpl: async () => root,
    }, 'daily');

    const externalAction = strategy.actions.find((action) => action.type === 'external');
    assert.equal(externalAction.status, 'complete');
    assert.deepEqual(await fs.readFile(externalAction.target), bytes);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('3-2-1 strategy reports when an external drive is unavailable', async () => {
  const strategy = await apply321Strategy({
    BACKUP_DIR: os.tmpdir(),
    checkExternalDriveImpl: async () => null,
  }, 'daily');
  assert.equal(strategy.actions.find((action) => action.type === 'external').status, 'unavailable');
  assert.ok(strategy.recommendations.some((recommendation) => recommendation.type === 'external'));
});
