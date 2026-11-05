import { register } from 'node:module';
register('./resolve-hook.mjs', import.meta.url);

// Keep browser-backed services usable in Node tests that do not import the
// integration bootstrap. The store is intentionally process-local.
const localStore = new Map();
globalThis.localStorage = {
  getItem: (key) => localStore.has(key) ? localStore.get(key) : null,
  setItem: (key, value) => localStore.set(key, String(value)),
  removeItem: (key) => localStore.delete(key),
};
