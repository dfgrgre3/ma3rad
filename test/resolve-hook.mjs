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
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
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
