const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('./ipc-handlers');
const { isAllowedExternalUrl } = require('./security-utils');

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 720,
    backgroundColor: '#1d2021',
    icon: path.join(__dirname, '../../build/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('context-menu', (event, params) => {
    if (!params.isEditable) return;
    Menu.buildFromTemplate([
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll },
    ]).popup({ window: win });
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
