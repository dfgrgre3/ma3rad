export async function resolve(specifier, context, nextResolve) {
  const isRelative = /^\.\.?\//.test(specifier) || specifier.startsWith('/');
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier);
  if (isRelative && !hasExtension) {
    const candidates = ['.ts', '.js', '/index.ts', '/index.js'];
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
