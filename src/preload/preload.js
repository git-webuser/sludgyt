const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, cb) {
  const listener = (event, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('api', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (partial) => ipcRenderer.invoke('settings:set', partial),
  },
  dialog: {
    pickDirectory: (defaultPath) => ipcRenderer.invoke('dialog:pick-directory', { defaultPath }),
    pickFile: (defaultPath) => ipcRenderer.invoke('dialog:pick-file', { defaultPath }),
  },
  queue: {
    add: (item) => ipcRenderer.invoke('queue:add', item),
    remove: (id) => ipcRenderer.invoke('queue:remove', { id }),
    cancel: (id) => ipcRenderer.invoke('queue:cancel', { id }),
    getAll: () => ipcRenderer.invoke('queue:get-all'),
    onUpdate: (cb) => subscribe('queue:update', cb),
    onRemoved: (cb) => subscribe('queue:removed', cb),
    onProgress: (cb) => subscribe('queue:progress', cb),
  },
  binaries: {
    checkYtDlp: (path) => ipcRenderer.invoke('binaries:check-ytdlp', path),
    checkFfmpeg: (path) => ipcRenderer.invoke('binaries:check-ffmpeg', path),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
    openPath: (filePath) => ipcRenderer.invoke('shell:open-path', filePath),
    showInFolder: (filePath) => ipcRenderer.invoke('shell:show-in-folder', filePath),
  },
});
