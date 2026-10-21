const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('widgetSettings', {
  read: () => ipcRenderer.invoke('settings:read'),
  save: value => ipcRenderer.invoke('settings:save', value),
});
