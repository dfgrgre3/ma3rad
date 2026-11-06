import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const host = '127.0.0.1';
const port = 5173;
const devUrl = `http://${host}:${port}`;
const viteCli = path.resolve(process.cwd(), 'node_modules/vite/bin/vite.js');
const electronCli = path.resolve(process.cwd(), 'node_modules/electron/cli.js');
const children = new Set();

function run(command, args, env = process.env) {
  const cleanEnv = { ...env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: cleanEnv,
    stdio: 'inherit',
    windowsHide: true,
    shell: false,
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

async function waitForVite(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(devUrl, { redirect: 'manual' });
      if (response.ok) {
        const html = await response.text();
        if (html.includes('/@vite/client') && html.includes('/src/main.tsx')) {
          return;
        }
      }
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not become ready at ${devUrl}.`);
}

function stopAll() {
  for (const child of children) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
  }
}

process.once('SIGINT', () => { stopAll(); process.exit(130); });
process.once('SIGTERM', () => { stopAll(); process.exit(143); });

if (!fs.existsSync(viteCli) || !fs.existsSync(electronCli)) {
  throw new Error('Local Vite or Electron CLI is missing. Restore project dependencies before starting Electron development.');
}

run(process.execPath, [viteCli, '--host', host, '--port', String(port), '--strictPort']);
try {
  await waitForVite();
  const electron = run(process.execPath, [electronCli, '.', '--enable-logging'], {
    ...process.env,
    VITE_DEV_SERVER_URL: devUrl,
    ELECTRON_ENABLE_LOGGING: '1',
  });
  const exitCode = await new Promise((resolve) => electron.once('exit', (code, signal) => {
    resolve(typeof code === 'number' ? code : signal ? 1 : 0);
  }));
  stopAll();
  process.exit(exitCode);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  stopAll();
  process.exit(1);
}
