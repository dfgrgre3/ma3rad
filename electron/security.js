const { pathToFileURL } = require('node:url');

function isAllowedAppUrl(senderUrl, { isPackaged, appHtmlPath, allowedOrigins }) {
  try {
    const url = new URL(senderUrl);
    if (isPackaged) {
      const expected = new URL(pathToFileURL(appHtmlPath).href);
      return url.protocol === 'file:'
        && url.host === expected.host
        && url.pathname === expected.pathname
        && !url.search;
    }
    return allowedOrigins.has(url.origin) && (url.pathname === '/' || url.pathname === '/index.html');
  } catch {
    return false;
  }
}

function isAllowedIpcSender(event, options) {
  const frame = event?.senderFrame;
  if (!frame || frame !== event.sender?.mainFrame) return false;
  return isAllowedAppUrl(frame.url, options);
}

module.exports = { isAllowedAppUrl, isAllowedIpcSender };
