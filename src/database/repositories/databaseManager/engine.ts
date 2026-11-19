import type { Database } from 'sql.js';
import type { DatabaseManager } from '../databaseManager';
import type { DatabaseManagerInternals } from './internals';

/**
 * sql.js engine loading + connection pragmas.
 * Extracted from databaseManager.ts; behaviour is identical.
 */

export async function initializeSqlEngine(host: DatabaseManager): Promise<void> {
  const h = host as unknown as DatabaseManagerInternals;
  const { initSqlJsFn, wasmUrl } = await resolveSqlJs();
  if (typeof initSqlJsFn !== 'function') {
    throw new TypeError(
      'sql.js could not be resolved to a callable init function ' +
      `(got: ${typeof initSqlJsFn}). The installed sql.js build may be ` +
      'incompatible with the active runtime.'
    );
  }

  console.log('[database] Loading SQL.js engine. WASM URL:', wasmUrl);
  try {
    h.SQL = await initSqlJsFn({
      locateFile: (_file: string) => wasmUrl,
    });
    console.log('[database] SQL.js engine ready.');
  } catch (err) {
    console.error('[database] SQL.js failed to load:', err);
    throw err;
  }
}

async function resolveSqlJs(): Promise<{ initSqlJsFn: any; wasmUrl?: string }> {
  // Resolve the sql.js engine + wasm URL in a runtime-agnostic way:
  //  - Browser / Vite bundler: load the browser distribution. sql.js is a
  //    CommonJS build whose `module.exports` is the init function, with
  //    `module.exports.default` set to itself for interop. The bundler's
  //    CommonJS interop can expose the callable through EITHER the module
  //    or a nested `.default` chain — walk down until we have a function.
  //  - Node (`node --test`): the test harness injects a global `initSqlJs`
  //    that points at the CommonJS build and a real wasm file path.
  let _initSqlJsFn: any;
  let wasmUrl: string | undefined;

  const injected = (globalThis as any)?.initSqlJs;
  if (typeof injected === 'function') {
    // Harness-injected initializer (also lets hosts override sql.js).
    return { initSqlJsFn: injected, wasmUrl };
  }

  const candidate = unwrapSqlJsInitializer(await loadSqlJsModule());
  try {
    // @ts-expect-error - Vite resolves this wasm asset URL at build time.
    wasmUrl = (await import('sql.js/dist/sql-wasm-browser.wasm?url')).default;
  } catch {
    wasmUrl = undefined;
  }

  return { initSqlJsFn: candidate, wasmUrl };
}

async function loadSqlJsModule(): Promise<any> {
  try {
    // @ts-expect-error - sql.js does not declare its distributable entry points.
    return await import('sql.js/dist/sql-wasm-browser.js');
  } catch {
    // Fallback for runtimes whose ESM bundler cannot import the browser distribution.
    try {
      const nodeModuleId = 'node:module';
      const { createRequire } = await import(/* @vite-ignore */ nodeModuleId);
      const __require = createRequire(import.meta.url);
      return __require('sql.js');
    } catch {
      return undefined;
    }
  }
}

function unwrapSqlJsInitializer(candidate: any): any {
  // Interop can expose the initializer through nested `.default` wrappers.
  for (let depth = 0; depth < 8; depth++) {
    if (typeof candidate === 'function') break;
    const next = candidate && candidate.default;
    if (next === undefined || next === null || next === candidate) break;
    candidate = next;
  }
  return candidate;
}

export function applyPerformancePragmas(database: Database): void {
  try {
    database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA synchronous = NORMAL;
      PRAGMA temp_store = MEMORY;
      PRAGMA cache_size = -4000;
    `);
  } catch {
    // Keep going if a pragma is unsupported by the engine build
  }
}
