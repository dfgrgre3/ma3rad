import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export async function resolve(specifier, context, nextResolve) {
  const isRelative = /^\.\.?\//.test(specifier) || specifier.startsWith('/');
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier);
  if (isRelative && !hasExtension) {
    const candidates = ['.ts', '.tsx', '.js', '/index.ts', '/index.tsx', '/index.js'];
    for (const ext of candidates) {
      try {
        return await nextResolve(specifier + ext, context);
      } catch {
        // try next candidate
      }
    }
  }
  const resolved = await nextResolve(specifier, context);
  // Node 24 validates JSON import attributes during resolution, before the
  // load hook can provide the source. Mark JSON as an explicitly handled
  // module so the mixed TypeScript/CommonJS test suite remains portable.
  if (resolved.url.endsWith('.json')) {
    return { ...resolved, format: 'module', shortCircuit: true };
  }
  return resolved;
}

export async function load(url, context, nextLoad) {
  // Node 24 enforces import attributes for JSON even when a CommonJS test
  // reaches the file through the registered ESM hooks. Return JSON explicitly
  // so the mixed .ts/.cjs test suite remains compatible across Node versions.
  if (url.endsWith('.json')) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    return { format: 'module', source: `export default ${source};`, shortCircuit: true };
  }
  if (url.endsWith('.tsx')) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    return { format: 'module', source: output.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
