'use strict';

// Mya's voice belongs to the app. A worker loads a small local Kokoro model;
// no external speech API, separate server or cloud transmission of dialogue.
const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const VOICES = Object.freeze([
  { id:'af_heart', label:'Heart · warm, sweet' },
  { id:'af_bella', label:'Bella · bright, expressive' },
  { id:'af_nicole', label:'Nicole · soft, intimate' },
  { id:'af_sarah', label:'Sarah · smooth, gentle' },
  { id:'af_kore', label:'Kore · clear, calm' },
  { id:'af_sky', label:'Sky · light, youthful' },
  { id:'bf_emma', label:'Emma · soft British' },
  { id:'bf_lily', label:'Lily · delicate British' }
]);
const VALID_VOICES = new Set(VOICES.map(x => x.id));
const MAX_WAV = 15 * 1024 * 1024;
class MyaNeuralVoice {
  constructor({ dataDir, WorkerType = Worker } = {}) {
    if (!dataDir) throw Error('Voice requires a private local data folder');
    this.dataDir = dataDir;
    this.WorkerType = WorkerType;
    this.worker = null;
    this.pending = new Map();
    this.nextId = 0;
    this.state = 'off';
    this.progress = '';
    this.lastError = '';
    this.activeInstall = null;
    this.installedPath = path.join(dataDir, 'kokoro-installed.json');
  }
  installed() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.installedPath, 'utf8'));
      return saved?.model === 'onnx-community/Kokoro-82M-v1.0-ONNX';
    } catch { return false; }
  }
  status() {
    return {
      state: this.state, ready: this.state === 'ready',
      installed: this.installed(), message: this.progress.slice(0, 140),
      lastError: this.lastError.slice(0, 260),
      voices: VOICES.map(x => ({...x}))
    };
  }
  _startWorker() {
    if (this.worker) return;
    const worker = new this.WorkerType(path.join(__dirname, 'neural-voice-worker.mjs'), {
      workerData: { cacheDir:path.join(this.dataDir, 'models', 'kokoro') }
    });
    this.worker = worker;
    worker.on('message', message => {
      if (this.worker !== worker || !message) return;
      if (message.type === 'progress') {
        this.progress = String(message.message || '');
        return;
      }
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.type === 'ready') {
        entry.resolve(true);
      } else if (message.type === 'audio') {
        const bytes = message.bytes;
        if (!(bytes instanceof Uint8Array) || bytes.length > MAX_WAV || bytes.length < 44 ||
            String.fromCharCode(...bytes.subarray(0,4)) !== 'RIFF') {
          entry.reject(Error('Invalid generated audio from Mya voice worker'));
        } else entry.resolve(bytes);
      } else entry.reject(Error(String(message.error || 'Voice worker error').slice(0,300)));
    });
    const failed = error => {
      if (this.worker !== worker) return;
      this.worker = null;
      this.state = 'error';
      this.lastError = String(error?.message || error).slice(0,300);
      for (const job of this.pending.values()) {
        clearTimeout(job.timer); job.reject(Error(this.lastError));
      }
      this.pending.clear();
    };
    worker.on('error', failed);
    worker.on('exit', code => {
      if (this.worker === worker)
        failed(Error('Voice worker stopped with code ' + code));
    });
  }
  _request(type, value = {}, timeoutMs = 120000) {
    this._startWorker();
    const id = ++this.nextId;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.worker?.postMessage({type:'cancel',id});
        reject(Error('Mya voice request timed out'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.worker.postMessage({ type, id, ...value }); }
      catch(error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  async init({ allowDownload = false } = {}) {
    if (this.state === 'ready') return this.status();
    if (this.activeInstall) return this.activeInstall;
    if (!allowDownload && !this.installed())
      throw Error('Mya neural voice has not been installed. Choose Install voice in Settings.');
    this.state = allowDownload ? 'installing' : 'loading';
    this.progress = allowDownload ? 'Downloading voice assets once, with your permission…' : 'Loading offline voice…';
    this.lastError = '';
    this.activeInstall = (async () => {
      try {
        await this._request('init', { allowDownload }, 300000);
        this.state = 'ready';
        this.progress = 'Mya neural voice ready · on-device';
        fs.mkdirSync(this.dataDir, {recursive:true});
        fs.writeFileSync(this.installedPath,
          JSON.stringify({ model:'onnx-community/Kokoro-82M-v1.0-ONNX',installedAt:new Date().toISOString() }),
          { mode:0o600 });
        return this.status();
      } catch(error) {
        this.state = 'error';
        this.lastError = error.message;
        throw error;
      } finally { this.activeInstall = null; }
    })();
    return this.activeInstall;
  }
  async synthesize(text, { voice='af_heart', speed=1 } = {}) {
    if (this.state !== 'ready') throw Error('Mya neural voice is not running');
    if (!VALID_VOICES.has(voice)) throw Error('Unknown Mya voice');
    const clean = String(text || '').trim();
    if (!clean || clean.length > 1200) throw Error('Speech text must be 1 to 1200 characters');
    return this._request('speak', { text:clean, voice, speed }, 60000);
  }
  cancel(id) {
    const entry = this.pending.get(id);
    if (!entry) return false;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    entry.reject(Error('Voice canceled'));
    this.worker?.postMessage({type:'cancel',id});
    return true;
  }
  stop() {
    const worker = this.worker;
    this.worker = null;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(Error('Voice stopped'));
    }
    this.pending.clear();
    if (worker) worker.terminate().catch(() => {});
    this.state = 'off';
    this.activeInstall = null;
    this.progress = '';
  }
}
module.exports = { MyaNeuralVoice, VOICES, VALID_VOICES };
