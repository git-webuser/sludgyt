const path = require('path');
const { pathToFileURL } = require('url');

function rendererIndexUrl() {
  return pathToFileURL(path.join(__dirname, '../renderer/index.html')).toString();
}

function isTrustedSender(event) {
  return Boolean(event && event.senderFrame && event.senderFrame.url === rendererIndexUrl());
}

function assertTrustedSender(event) {
  if (!isTrustedSender(event)) {
    throw new Error('IPC sender is not trusted.');
  }
}

function isAllowedExternalUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;

  if (parsed.hostname === 'github.com') {
    return parsed.pathname === '/yt-dlp/yt-dlp' || parsed.pathname.startsWith('/yt-dlp/yt-dlp/');
  }

  return parsed.hostname === 'ffmpeg.org';
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

module.exports = {
  assertTrustedSender,
  isAllowedExternalUrl,
  isHttpUrl,
};
