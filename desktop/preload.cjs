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
  listeningStatus: () => ipcRenderer.invoke('mya:listening-status'),
  loadListening: () => ipcRenderer.invoke('mya:listening-load'),
  installListening: () => ipcRenderer.invoke('mya:listening-install'),
  neuralVoiceStatus: () => ipcRenderer.invoke('mya:voice-status'),
  installNeuralVoice: () => ipcRenderer.invoke('mya:voice-install'),
  loadNeuralVoice: () => ipcRenderer.invoke('mya:voice-load'),
  synthesizeNeuralVoice: (text) => ipcRenderer.invoke('mya:voice-synthesize', text),
  stopNeuralVoice: () => ipcRenderer.invoke('mya:voice-stop-speech'),
  brainInstallStatus: () => ipcRenderer.invoke('mya:brain-install-status'),
  installBrain: (tier) => ipcRenderer.invoke('mya:brain-install',tier),
  cancelBrainInstall: () => ipcRenderer.invoke('mya:brain-install-cancel'),
  onBrainInstallProgress: (fn) => {
    const handler = (_event, data) => fn(data);
    ipcRenderer.on('mya:brain-install-progress', handler);
    return () => ipcRenderer.removeListener('mya:brain-install-progress', handler);
  },
  engineStatus: () => ipcRenderer.invoke('mya:engine-status'),
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
  pendingMemories: () => ipcRenderer.invoke('mya:memory-candidates'),
  approveMemory: (id) => ipcRenderer.invoke('mya:memory-approve', id),
  rejectMemory: (id) => ipcRenderer.invoke('mya:memory-reject', id),
  episodicMemories: () => ipcRenderer.invoke('mya:memory-episodes'),
  deleteEpisode: (id) => ipcRenderer.invoke('mya:memory-episode-delete', id),
  localConversations: () => ipcRenderer.invoke('mya:memory-conversations'),
  readConversation: (id) => ipcRenderer.invoke('mya:memory-conversation-read',id),
  deleteConversation: (id) => ipcRenderer.invoke('mya:memory-conversation-delete', id),
  relationshipHistory: () => ipcRenderer.invoke('mya:memory-relationship'),
  memoryRecall: (query) => ipcRenderer.invoke('mya:memory-search',query),
  embeddingStatus: () => ipcRenderer.invoke('mya:embedding-status'),
  installEmbeddings: () => ipcRenderer.invoke('mya:embedding-install'),
  resetAllPersonalMemory: () => ipcRenderer.invoke('mya:memory-reset-all'),
  toggleClickThrough: () => ipcRenderer.invoke('mya:toggle-click-through'),
  minimize: () => ipcRenderer.invoke('mya:minimize'),
  quit: () => ipcRenderer.invoke('mya:quit'),
  onObservationStopped: (fn) => {
    const handler = () => fn();
    ipcRenderer.on('mya:observe-stopped', handler);
    return () => ipcRenderer.removeListener('mya:observe-stopped', handler);
  }
}));
