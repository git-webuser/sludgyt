const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function defaults() {
  return {
    ytDlpPath: 'yt-dlp',
    ffmpegPath: 'ffmpeg',
    defaultSaveDir: app.getPath('downloads'),
    themeId: 'vscode-dark',
    customTheme: null,
  };
}

function readSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8');
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    return defaults();
  }
}

function writeSettings(partial) {
  const merged = { ...readSettings(), ...partial };
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

module.exports = { readSettings, writeSettings };
