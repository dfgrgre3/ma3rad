// Node shim so the browser-coupled DatabaseManager can boot under `node --test`.
// Sets the globals (window, localStorage, initSqlJs, fetch) that db.ts expects.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
// Require the CJS Node build directly (bypassing the package "browser" ESM export
// that tries to `import` the .wasm as a module and breaks under Node's ESM loader).
const initSqlJs = require(path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.js'));
const wasmPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

(globalThis as any).window = {
  location: { origin: 'http://localhost' },
  // Emscripten's browser build fetches the wasm via fetch(locateFile(...)); we serve it from disk.
  initSqlJs: (opts: any) => initSqlJs({ ...opts, locateFile: () => wasmPath }),
};

const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => {
    store[k] = String(v);
  },
  removeItem: (k: string) => {
    delete store[k];
  },
};

(globalThis as any).fetch = async (_url: string) => {
  const bytes = fs.readFileSync(wasmPath);
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => '',
  } as any;
};
