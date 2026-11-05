const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createFileLogger, registerProcessErrorHandlers } = require('../electron/diagnostics');

test('file logger persists errors, redacts credentials, and rotates oversized logs', (context) => {
  const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-logs-'));
  context.after(() => fs.rmSync(logDirectory, { recursive: true, force: true }));
  const logger = createFileLogger({ fs, path, logDirectory, maxFileBytes: 150 });

  assert.equal(logger.write(
    'error',
    new Error('request failed'),
    'token=private-value',
    'Authorization: Bearer private-auth',
  ), true);
  assert.equal(logger.write('error', 'second error'), true);

  const currentLog = fs.readFileSync(logger.logFile, 'utf8');
  const previousLog = fs.readFileSync(`${logger.logFile}.1`, 'utf8');
  assert.match(currentLog, /second error/);
  assert.match(previousLog, /request failed/);
  assert.match(previousLog, /token=\[REDACTED\]/);
  assert.match(previousLog, /Authorization: \[REDACTED\]/);
  assert.doesNotMatch(previousLog, /private-value/);
  assert.doesNotMatch(previousLog, /private-auth/);
});

test('fatal main-process exceptions are logged and request a graceful application quit', () => {
  const processObject = new EventEmitter();
  const logged = [];
  let quitCount = 0;
  registerProcessErrorHandlers(processObject, { quit: () => { quitCount++; } }, {
    write: (...args) => logged.push(args),
  });

  const fatalError = new Error('fatal');
  processObject.emit('uncaughtException', fatalError);
  processObject.emit('uncaughtException', fatalError);
  processObject.emit('unhandledRejection', new Error('rejected'));

  assert.equal(quitCount, 1);
  assert.equal(logged.length, 3);
  assert.equal(logged[0][0], 'error');
  assert.equal(logged[0][2], fatalError);
  assert.match(logged[2][1], /Unhandled promise rejection/);
});
