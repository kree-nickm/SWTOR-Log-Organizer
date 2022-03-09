const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
   inspectElement: (menuOffset) => ipcRenderer.send('inspect', menuOffset),
   deleteLog: (filename) => ipcRenderer.send('delete-log', filename),
   populateLogList: (callback) => ipcRenderer.on('log-list', callback),
});
