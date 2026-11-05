const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  apply321Strategy,
  checkExternalDrive,
  cleanupOldBackups,
  getBackupStrategyStats,
} = require('../electron/backupStrategyService');

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

test('macOS USB detection inspects each mounted volume instead of the /Volumes parent', async () => {
  const calls = [];
  const mountPath = await checkExternalDrive({
    platform: 'darwin',
    fsImpl: { readdirSync: () => ['Backup USB'] },
    execFileImpl: (command, args, callback) => {
      calls.push({ command, args });
      callback(null, [
        '<dict>',
        '<key>DeviceLocation</key><string>External</string>',
        '<key>MountPoint</key><string>/Volumes/Backup USB</string>',
        '</dict>',
      ].join(''));
    },
  });
  assert.equal(mountPath, '/Volumes/Backup USB');
  assert.deepEqual(calls[0].args, ['info', '-plist', '/Volumes/Backup USB']);
});

test('backup strategy copies the encrypted local backup to USB and verifies SHA-256', async () => {
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

test('backup strategy rejects a same-size copy with different content', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-backup-strategy-'));
  try {
    const backupPath = path.join(root, 'ceramisys_daily_hash.sqlite.enc');
    const bytes = Buffer.from('same-sized encrypted backup');
    await fs.writeFile(backupPath, bytes);
    const fsImpl = Object.create(fs);
    fsImpl.copyFile = async (source, destination, flags) => {
      await fs.copyFile(source, destination, flags);
      await fs.writeFile(destination, Buffer.alloc(bytes.length, 0));
    };
    const strategy = await apply321Strategy({
      BACKUP_DIR: path.join(root, 'local-backups'),
      backupPath,
      fsImpl,
      checkExternalDriveImpl: async () => root,
    }, 'daily');

    assert.equal(strategy.actions.find((action) => action.type === 'external').status, 'failed');
    assert.match(strategy.actions.find((action) => action.type === 'external').description, /SHA-256/);
    await assert.rejects(fs.stat(path.join(root, 'CeramiSys', 'Backups', path.basename(backupPath))), {
      code: 'ENOENT',
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('backup statistics count local and recovery files, and cleanup retains only configured recent files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-backup-strategy-'));
  try {
    const backupDir = path.join(root, 'backups');
    await fs.mkdir(backupDir);
    const names = [
      'ceramisys_manual_a.sqlite.enc',
      'ceramisys_manual_b.sqlite.enc',
      'ceramisys_corrupt_a.sqlite.enc',
      'ceramisys_replaced_b.sqlite.enc',
    ];
    for (const [index, name] of names.entries()) {
      await fs.writeFile(path.join(backupDir, name), Buffer.alloc(index + 1));
    }

    const stats = await getBackupStrategyStats({ BACKUP_DIR: backupDir });
    assert.equal(stats.totalBackups, 4);
    assert.equal(stats.totalSizeBytes, 10);
    assert.equal(stats.strategies.local.length, 2);
    assert.equal(stats.strategies.recovery.length, 2);

    const deleted = await cleanupOldBackups({ BACKUP_DIR: backupDir }, {
      daily: 7,
      weekly: 4,
      monthly: 12,
      local: { maxCount: 1, retentionDays: 365 },
      recovery: { maxCount: 1, retentionDays: 365 },
    });
    assert.equal(deleted, 2);
    assert.equal((await fs.readdir(backupDir)).length, 2);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
