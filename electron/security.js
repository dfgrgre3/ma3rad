const path = require('node:path');
const { fileURLToPath } = require('node:url');

function sameLocalFileUrl(senderUrl, expectedPath) {
  try {
    const actual = new URL(senderUrl);
    if (actual.protocol !== 'file:' || actual.search) return false;

    // Electron may serialize local file URLs with different escaping or path
    // casing on Windows. Compare decoded, normalized filesystem paths instead
    // of URL pathname strings. Hash routing is safe and intentionally ignored.
    const actualPath = path.normalize(fileURLToPath(actual));
    const expected = path.normalize(path.resolve(expectedPath));
    return process.platform === 'win32'
      ? actualPath.toLowerCase() === expected.toLowerCase()
      : actualPath === expected;
  } catch {
    return false;
  }
}

function isAllowedAppUrl(senderUrl, { isPackaged, appHtmlPath, allowedOrigins }) {
  try {
    const url = new URL(senderUrl);
    // Development can run from either Vite's local origin or the exact built
    // index.html (for `electron .` without a dev server). Never trust an
    // arbitrary file URL, even when the app itself is unpackaged.
    if (isPackaged || url.protocol === 'file:') {
      return sameLocalFileUrl(url.href, appHtmlPath);
    }
    return allowedOrigins.has(url.origin) && (url.pathname === '/' || url.pathname === '/index.html');
  } catch {
    return false;
  }
}

function isAllowedIpcSender(event, options) {
  const frame = event?.senderFrame;
  const mainFrame = event?.sender?.mainFrame;
  if (!frame || !mainFrame) return false;

  // WebFrameMain wrappers are not guaranteed to retain JS object identity
  // across Electron IPC boundaries. The process/routing pair is Electron's
  // stable frame identity; keep a strict check so subframes remain rejected.
  const isMainFrame = frame === mainFrame
    || frame.parent === null
    || (Number.isInteger(frame.processId)
      && Number.isInteger(frame.routingId)
      && frame.processId === mainFrame.processId
      && frame.routingId === mainFrame.routingId);
  if (!isMainFrame) return false;
  return isAllowedAppUrl(frame.url, options);
}

module.exports = { isAllowedAppUrl, isAllowedIpcSender, sameLocalFileUrl };
