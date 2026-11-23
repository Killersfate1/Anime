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
  neuralVoiceStatus: () => ipcRenderer.invoke('mya:voice-status'),
  installNeuralVoice: () => ipcRenderer.invoke('mya:voice-install'),
  loadNeuralVoice: () => ipcRenderer.invoke('mya:voice-load'),
  synthesizeNeuralVoice: (text) => ipcRenderer.invoke('mya:voice-synthesize', text),
  stopNeuralVoice: () => ipcRenderer.invoke('mya:voice-stop-speech'),
  engineStatus: () => ipcRenderer.invoke('mya:engine-status'),
  openEngineResource: (kind) => ipcRenderer.invoke('mya:engine-resource', kind),
  chooseEngineFile: (kind) => ipcRenderer.invoke('mya:engine-choose', kind),
  configureEngine: (options) => ipcRenderer.invoke('mya:engine-options', options),
  clearProjector: () => ipcRenderer.invoke('mya:engine-clear-projector'),
  startEngine: () => ipcRenderer.invoke('mya:engine-start'),
  stopEngine: () => ipcRenderer.invoke('mya:engine-stop'),
  cancelLocalChat: () => ipcRenderer.invoke('mya:chat-cancel'),
  onChatDelta: (fn) => {
    const handler = (_event, payload) => fn(payload);
    ipcRenderer.on('mya:chat-delta', handler);
    return () => ipcRenderer.removeListener('mya:chat-delta', handler);
  },
  askLocalAI: (question, requestId) => ipcRenderer.invoke('mya:chat', question, requestId),
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
