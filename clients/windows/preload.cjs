'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('YangyizhiDesktop', Object.freeze({
  versions: () => ipcRenderer.invoke('app:versions'),
  checkUpdate: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  openUpdate: () => ipcRenderer.invoke('updates:open'),
  cloudRequest: request => ipcRenderer.invoke('cloud:request', request),
}));
