const { contextBridge, ipcRenderer } = require('electron');

// Explicit allowlist. The renderer has no Node.js or filesystem access.
contextBridge.exposeInMainWorld('mya', Object.freeze({
  modelInfo: () => ipcRenderer.invoke('mya:model-info'),
  loadModel: () => ipcRenderer.invoke('mya:model-read'),
  importModel: () => ipcRenderer.invoke('mya:model-import'),
  animationList: () => ipcRenderer.invoke('mya:animation-list'),
  readAnimation: (name) => ipcRenderer.invoke('mya:animation-read', name),
  selectSources: () => ipcRenderer.invoke('mya:sources'),
  startObservation: (sourceId) => ipcRenderer.invoke('mya:observe-start', sourceId),
  stopObservation: () => ipcRenderer.invoke('mya:observe-stop'),
  observe: () => ipcRenderer.invoke('mya:observe-sample'),
  askLocalAI: (question) => ipcRenderer.invoke('mya:chat', question),
  settings: () => ipcRenderer.invoke('mya:settings'),
  updateSettings: (settings) => ipcRenderer.invoke('mya:settings-update', settings),
  getMemories: () => ipcRenderer.invoke('mya:memory-list'),
  addMemory: (text) => ipcRenderer.invoke('mya:memory-add', text),
  clearMemories: () => ipcRenderer.invoke('mya:memory-clear'),
  toggleClickThrough: () => ipcRenderer.invoke('mya:toggle-click-through'),
  minimize: () => ipcRenderer.invoke('mya:minimize'),
  quit: () => ipcRenderer.invoke('mya:quit'),
  onObservationStopped: (fn) => {
    const handler = () => fn();
    ipcRenderer.on('mya:observe-stopped', handler);
    return () => ipcRenderer.removeListener('mya:observe-stopped', handler);
  }
}));
