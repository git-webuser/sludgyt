const fs = require('fs');
const { ipcMain, dialog, shell, clipboard, BrowserWindow } = require('electron');
const settingsStore = require('./settings-store');
const queueManager = require('./queue-manager');
const { checkYtDlp, checkFfmpeg, autoDetectBinary } = require('./version-check');
const { listCookieBrowsers } = require('./browser-detector');
const { assertTrustedSender, isAllowedExternalUrl } = require('./security-utils');

function trustedHandler(handler) {
  return (event, ...args) => {
    assertTrustedSender(event);
    return handler(event, ...args);
  };
}

function registerIpcHandlers() {
  ipcMain.handle('settings:get', trustedHandler(() => settingsStore.readSettings()));
  ipcMain.handle('settings:set', trustedHandler((event, partial) => settingsStore.writeSettings(partial)));
  ipcMain.handle('browsers:list-cookie-sources', trustedHandler(() => listCookieBrowsers()));

  ipcMain.handle('dialog:pick-directory', trustedHandler(async (event, { defaultPath } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      defaultPath,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }));

  ipcMain.handle('dialog:pick-file', trustedHandler(async (event, { defaultPath } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      defaultPath,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }));

  ipcMain.handle('queue:add', trustedHandler((event, item) => queueManager.addItem(item)));
  ipcMain.handle('queue:remove', trustedHandler((event, { id } = {}) => queueManager.removeItem(id)));
  ipcMain.handle('queue:cancel', trustedHandler((event, { id } = {}) => queueManager.cancelItem(id)));
  ipcMain.handle('queue:get-all', trustedHandler(() => queueManager.getAll()));
  ipcMain.handle('queue:reorder', trustedHandler((event, orderedIds) => queueManager.reorderItems(orderedIds)));

  ipcMain.handle('binaries:check-ytdlp', trustedHandler((event, path, opts) => checkYtDlp(path, opts)));
  ipcMain.handle('binaries:check-ffmpeg', trustedHandler((event, path) => checkFfmpeg(path)));

  // `which` is a fixed enum, never the raw renderer string — it maps to a hardcoded
  // literal command name below before it ever reaches the PowerShell invocation in
  // autoDetectBinary, so a compromised renderer can't inject into that command.
  ipcMain.handle('binaries:auto-detect', trustedHandler((event, which) => {
    const name = which === 'ffmpeg' ? 'ffmpeg' : 'yt-dlp';
    return autoDetectBinary(name);
  }));

  ipcMain.handle('shell:open-external', trustedHandler((event, url) => {
    if (!isAllowedExternalUrl(url)) {
      return { ok: false, error: 'URL не в списке разрешённых.' };
    }
    shell.openExternal(url);
    return { ok: true };
  }));

  ipcMain.handle('shell:open-path', trustedHandler((event, filePath) => {
    if (!queueManager.isKnownFinalPath(filePath) || !fs.existsSync(filePath)) {
      return { ok: false, error: 'Файл не найден на диске.' };
    }
    const err = shell.openPath(filePath);
    return err ? { ok: false, error: err } : { ok: true };
  }));

  ipcMain.handle('shell:show-in-folder', trustedHandler((event, filePath) => {
    if (!queueManager.isKnownFinalPath(filePath) || !fs.existsSync(filePath)) {
      return { ok: false, error: 'Файл не найден на диске.' };
    }
    shell.showItemInFolder(filePath);
    return { ok: true };
  }));

  ipcMain.handle('clipboard:read-text', trustedHandler(() => clipboard.readText()));
}

module.exports = { registerIpcHandlers };
