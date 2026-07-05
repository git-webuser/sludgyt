const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const THEME_IDS = new Set(['vscode-dark', 'mono-day', 'mono-night', 'custom']);
const THEME_COLOR_KEYS = [
  'bg',
  'bgElevated',
  'fg',
  'fgMuted',
  'accent',
  'accentStrong',
  'border',
  'warn',
  'error',
  'success',
  'onAccent',
];
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function defaults() {
  return {
    ytDlpPath: 'yt-dlp',
    ffmpegPath: 'ffmpeg',
    cookiesFromBrowser: '',
    defaultSaveDir: app.getPath('downloads'),
    themeId: 'vscode-dark',
    customTheme: null,
  };
}

function stringValue(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function sanitizeCustomTheme(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const sanitized = {};
  for (const key of THEME_COLOR_KEYS) {
    if (typeof value[key] === 'string' && HEX_COLOR_RE.test(value[key])) {
      sanitized[key] = value[key].toLowerCase();
    }
  }

  return THEME_COLOR_KEYS.every((key) => sanitized[key]) ? sanitized : null;
}

function sanitizeSettings(candidate = {}) {
  const base = defaults();
  const themeId = stringValue(candidate.themeId, base.themeId);

  return {
    ytDlpPath: stringValue(candidate.ytDlpPath, base.ytDlpPath) || base.ytDlpPath,
    ffmpegPath: stringValue(candidate.ffmpegPath, base.ffmpegPath) || base.ffmpegPath,
    cookiesFromBrowser: stringValue(candidate.cookiesFromBrowser, base.cookiesFromBrowser),
    defaultSaveDir: stringValue(candidate.defaultSaveDir, base.defaultSaveDir) || base.defaultSaveDir,
    themeId: THEME_IDS.has(themeId) ? themeId : base.themeId,
    customTheme: sanitizeCustomTheme(candidate.customTheme),
  };
}

function readSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8');
    return sanitizeSettings({ ...defaults(), ...JSON.parse(raw) });
  } catch {
    return defaults();
  }
}

function writeSettings(partial) {
  const merged = sanitizeSettings({ ...readSettings(), ...partial });
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

module.exports = { readSettings, writeSettings };
