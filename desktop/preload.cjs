const { contextBridge, ipcRenderer } = require('electron');

// Explicit allowlist. The renderer has no Node.js or filesystem access.
contextBridge.exposeInMainWorld('mya', Object.freeze({
  modelInfo: () => ipcRenderer.invoke('mya:model-info'),
  diagnostics: () => ipcRenderer.invoke('mya:diagnostics'),
  loadModel: () => ipcRenderer.invoke('mya:model-read'),
  importModel: () => ipcRenderer.invoke('mya:model-import'),
  animationList: () => ipcRenderer.invoke('mya:animation-list'),
  readAnimation: (name) => ipcRenderer.invoke('mya:animation-read', name),
  selectSources: () => ipcRenderer.invoke('mya:sources'),
  startObservation: (sourceId) => ipcRenderer.invoke('mya:observe-start', sourceId),
  stopObservation: () => ipcRenderer.invoke('mya:observe-stop'),
  observe: () => ipcRenderer.invoke('mya:observe-sample'),
  armMicrophone: () => ipcRenderer.invoke('mya:mic-arm'),
  disarmMicrophone: () => ipcRenderer.invoke('mya:mic-disarm'),
  transcribeMicrophone: (wav) => ipcRenderer.invoke('mya:voice-transcribe', wav),
  cancelTranscription: () => ipcRenderer.invoke('mya:voice-cancel'),
  askLocalAI: (question) => ipcRenderer.invoke('mya:chat', question),
  openResearchSource: (url) => ipcRenderer.invoke('mya:open-source', url),
  clearSessionChat: () => ipcRenderer.invoke('mya:chat-clear'),
  settings: () => ipcRenderer.invoke('mya:settings'),
  updateSettings: (settings) => ipcRenderer.invoke('mya:settings-update', settings),
  getMemories: () => ipcRenderer.invoke('mya:memory-list'),
  addMemory: (record) => ipcRenderer.invoke('mya:memory-add', record),
  updateMemory: (record) => ipcRenderer.invoke('mya:memory-update', record),
  deleteMemory: (id) => ipcRenderer.invoke('mya:memory-delete', id),
  exportMemories: () => ipcRenderer.invoke('mya:memory-export'),
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
