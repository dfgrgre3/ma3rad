const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeHardwareId } = require('../electron/hardwareId');

test('hardware identity remains stable when only the hostname changes', () => {
  const compute = (hostname) => computeHardwareId({
    platform: 'win32',
    hostname,
    execSync: (command) => {
      if (command.startsWith('wmic csproduct')) return 'UUID=stable-board-uuid\r\n';
      throw new Error('hardware source unavailable');
    },
    cpus: [{ model: 'CPU model' }],
    arch: 'x64',
  });

  assert.equal(compute('sales-terminal'), compute('renamed-terminal'));
});
