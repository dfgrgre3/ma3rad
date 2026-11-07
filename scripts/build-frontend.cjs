const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const projectId = crypto.createHash('sha256').update(projectRoot).digest('hex').slice(0, 16);
const lockPath = path.join(os.tmpdir(), `ceramisys-frontend-build-${projectId}.lock`);
const LOCK_POLL_INTERVAL_MS = 500;
const LOCK_WAIT_TIMEOUT_MS = 15 * 60 * 1000;

function waitBeforeRetry(delayMs) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

function acquireBuildLock({
  lockPath: buildLockPath = lockPath,
  pid = process.pid,
  processRunning = isProcessRunning,
  wait = waitBeforeRetry,
  timeoutMs = LOCK_WAIT_TIMEOUT_MS,
  now = Date.now,
} = {}) {
  const lockToken = crypto.randomUUID();
  let waitStartedAt;

  function waitForLock(owner = '') {
    waitStartedAt ??= now();
    const remainingMs = timeoutMs - (now() - waitStartedAt);
    if (remainingMs <= 0) {
      throw new Error(`Timed out waiting for frontend build lock${owner}.`);
    }
    wait(Math.min(LOCK_POLL_INTERVAL_MS, remainingMs));
  }

  while (true) {
    let lockFd;
    try {
      lockFd = fs.openSync(buildLockPath, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      let existingContents;
      try {
        existingContents = fs.readFileSync(buildLockPath, 'utf8');
      } catch (readError) {
        if (readError.code === 'ENOENT') continue;
        throw readError;
      }

      let existingLock;
      try {
        existingLock = JSON.parse(existingContents);
      } catch {
        if (!existingContents) {
          waitForLock();
          continue;
        }
        throw new Error(`Cannot verify existing frontend build lock: ${buildLockPath}`);
      }

      if (!Number.isSafeInteger(existingLock.pid) || existingLock.pid <= 0
        || typeof existingLock.token !== 'string') {
        throw new Error(`Invalid existing frontend build lock: ${buildLockPath}`);
      }

      if (processRunning(existingLock.pid)) {
        waitForLock(` held by PID ${existingLock.pid}`);
        continue;
      }

      let currentContents;
      try {
        currentContents = fs.readFileSync(buildLockPath, 'utf8');
      } catch (readError) {
        if (readError.code === 'ENOENT') continue;
        throw readError;
      }
      if (currentContents !== existingContents) continue;
      fs.unlinkSync(buildLockPath);
      continue;
    }

    try {
      fs.writeFileSync(lockFd, JSON.stringify({ pid, token: lockToken }));
    } catch (error) {
      fs.closeSync(lockFd);
      fs.unlinkSync(buildLockPath);
      throw error;
    }
    fs.closeSync(lockFd);

    return () => {
      const currentLock = JSON.parse(fs.readFileSync(buildLockPath, 'utf8'));
      if (currentLock.token === lockToken) fs.unlinkSync(buildLockPath);
    };
  }
}

function resolveBuildFlavor(args) {
  if (args.some((arg) => arg !== '--local')) {
    throw new Error(`Unsupported frontend build argument: ${args.find((arg) => arg !== '--local')}`);
  }
  if (args.filter((arg) => arg === '--local').length > 1) {
    throw new Error('The --local frontend build argument may only be specified once.');
  }
  return args.includes('--local') ? 'local' : 'commercial';
}

function runNodeScript(scriptPath, args = [], nodeOptions = [], env = process.env) {
  const child = spawnSync(process.execPath, [...nodeOptions, scriptPath, ...args], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });

  if (child.error) throw child.error;
  if (child.signal) throw new Error(`${path.basename(scriptPath)} was terminated by ${child.signal}`);
  if (child.status !== 0) {
    throw new Error(`${path.basename(scriptPath)} exited with status ${child.status}`);
  }
}

function buildFrontend(args = process.argv.slice(2)) {
  let releaseBuildLock;
  try {
    const buildFlavor = resolveBuildFlavor(args);
    releaseBuildLock = acquireBuildLock();
    const viteCliPath = path.resolve(path.dirname(require.resolve('vite')), '..', '..', 'bin', 'vite.js');
    runNodeScript(viteCliPath, ['build'], [], {
      ...process.env,
      CERAMISYS_BUILD_FLAVOR: buildFlavor,
    });
    runNodeScript(
      path.join(__dirname, 'obfuscate-frontend.cjs'),
      [],
      ['--max-old-space-size=8192'],
    );
  } catch (error) {
    console.error('Frontend build failed:', error);
    process.exitCode = 1;
  } finally {
    releaseBuildLock?.();
  }
}

if (require.main === module) buildFrontend();

module.exports = { acquireBuildLock, buildFrontend, resolveBuildFlavor };
