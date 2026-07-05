const { session, BrowserWindow } = require('electron');
const { looksLikeRawManifest } = require('../shared/manifest-heuristic');
const { isHttpUrl } = require('./security-utils');

const MANIFEST_CONTENT_TYPES = ['mpegurl', 'dash+xml'];

function isManifestResponse(url, responseHeaders) {
  const headers = responseHeaders || {};
  const contentTypeKey = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
  const contentType = contentTypeKey ? String(headers[contentTypeKey][0]).toLowerCase() : '';
  return MANIFEST_CONTENT_TYPES.some((t) => contentType.includes(t)) || looksLikeRawManifest(url);
}

/**
 * Loads pageUrl in a hidden, isolated browser session and waits for the first
 * network response that looks like an HLS/DASH manifest, mirroring what a user
 * would do by hand via devtools' Network tab.
 * Returns { promise, abort }: promise resolves with either
 *   { ok: true, manifestUrl, referer, userAgent }
 * or { ok: false, error }.
 */
function sniffManifest(pageUrl, timeoutMs = 20000) {
  if (!isHttpUrl(pageUrl)) {
    return {
      promise: Promise.resolve({ ok: false, error: 'Автопоиск манифеста поддерживает только http/https ссылки.' }),
      abort: () => {},
    };
  }

  let settled = false;
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const partitionName = `sniff-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ses = session.fromPartition(partitionName, { cache: false });
  ses.setPermissionRequestHandler((webContents, permission, callback) => callback(false));
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  const pendingHeaders = new Map();

  const finish = (result) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (!win.isDestroyed()) win.destroy();
    resolvePromise(result);
  };

  const timer = setTimeout(() => {
    finish({ ok: false, error: 'Не удалось обнаружить манифест на странице за отведённое время.' });
  }, timeoutMs);

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    pendingHeaders.set(details.id, details.requestHeaders);
    callback({ requestHeaders: details.requestHeaders });
  });

  ses.webRequest.onHeadersReceived((details, callback) => {
    if (isManifestResponse(details.url, details.responseHeaders)) {
      const reqHeaders = pendingHeaders.get(details.id) || {};
      finish({
        ok: true,
        manifestUrl: details.url,
        referer: reqHeaders.Referer || reqHeaders.referer || pageUrl,
        userAgent: reqHeaders['User-Agent'] || reqHeaders['user-agent'] || '',
      });
    }
    callback({});
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.webContents.on('will-navigate', (event, url) => {
    if (!isHttpUrl(url)) {
      event.preventDefault();
    }
  });

  win.webContents.on('did-fail-load', (event, code, desc) => {
    if (code !== -3) {
      // -3 is ERR_ABORTED, expected when we destroy the window ourselves.
      finish({ ok: false, error: `Не удалось загрузить страницу: ${desc}` });
    }
  });

  win.loadURL(pageUrl).catch(() => {
    // Failure is already handled via did-fail-load / timeout above.
  });

  const abort = () => finish({ ok: false, error: 'Отменено пользователем.' });

  return { promise, abort };
}

module.exports = { sniffManifest };
