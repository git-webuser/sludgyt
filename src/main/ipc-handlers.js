const fs = require('fs');
const { ipcMain, dialog, shell, BrowserWindow } = require('electron');
const settingsStore = require('./settings-store');
const queueManager = require('./queue-manager');
const { checkYtDlp, checkFfmpeg } = require('./version-check');

const ALLOWED_EXTERNAL_PREFIXES = ['https://github.com/yt-dlp/yt-dlp', 'https://ffmpeg.org'];

function registerIpcHandlers() {
  ipcMain.handle('settings:get', () => settingsStore.readSettings());
  ipcMain.handle('settings:set', (event, partial) => settingsStore.writeSettings(partial));

  ipcMain.handle('dialog:pick-directory', async (event, { defaultPath } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      defaultPath,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:pick-file', async (event, { defaultPath } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      defaultPath,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('queue:add', (event, item) => queueManager.addItem(item));
  ipcMain.handle('queue:remove', (event, { id }) => queueManager.removeItem(id));
  ipcMain.handle('queue:cancel', (event, { id }) => queueManager.cancelItem(id));
  ipcMain.handle('queue:get-all', () => queueManager.getAll());

  ipcMain.handle('binaries:check-ytdlp', (event, path) => checkYtDlp(path));
  ipcMain.handle('binaries:check-ffmpeg', (event, path) => checkFfmpeg(path));

  ipcMain.handle('shell:open-external', (event, url) => {
    if (!ALLOWED_EXTERNAL_PREFIXES.some((prefix) => url.startsWith(prefix))) {
      return { ok: false, error: 'URL не в списке разрешённых.' };
    }
    shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('shell:open-path', (event, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) {
      return { ok: false, error: 'Файл не найден на диске.' };
    }
    const err = shell.openPath(filePath);
    return err ? { ok: false, error: err } : { ok: true };
  });

  ipcMain.handle('shell:show-in-folder', (event, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) {
      return { ok: false, error: 'Файл не найден на диске.' };
    }
    shell.showItemInFolder(filePath);
    return { ok: true };
  });
}

module.exports = { registerIpcHandlers };
