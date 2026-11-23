'use strict';

// Mya-owned local inference runtime. No Ollama, cloud inference or external
// service dependency: a user-selected llama-server executable loads a GGUF
// model, bound to loopback only. Engine/models remain local and user-owned.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

const HOST = '127.0.0.1';
const PORT = 18931;
const READY_TIMEOUT_MS = 120000;
const MAX_REPLY = 12000;

function isGGUF(filename) {
  if (typeof filename !== 'string' || path.extname(filename).toLowerCase() !== '.gguf') return false;
  let fd;
  try {
    const stat = fs.statSync(filename);
    if (!stat.isFile() || stat.size < 1024 * 1024) return false;
    const header = Buffer.alloc(4);
    fd = fs.openSync(filename, 'r');
    fs.readSync(fd, header, 0, 4, 0);
    return header.toString('ascii') === 'GGUF';
  } catch { return false; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
function isLlamaServer(filename, platform = process.platform) {
  if (typeof filename !== 'string') return false;
  const name = path.basename(filename).toLowerCase();
  if (platform === 'win32' ? name !== 'llama-server.exe' : name !== 'llama-server') return false;
  try { return fs.statSync(filename).isFile(); } catch { return false; }
}
function normalizeConfig(value) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    enginePath: typeof raw.enginePath === 'string' ? raw.enginePath : '',
    modelPath: typeof raw.modelPath === 'string' ? raw.modelPath : '',
    projectorPath: typeof raw.projectorPath === 'string' ? raw.projectorPath : '',
    gpuLayers: Number.isInteger(raw.gpuLayers) ? Math.min(99, Math.max(0, raw.gpuLayers)) : 0,
    contextSize: Number.isInteger(raw.contextSize) ? Math.min(16384, Math.max(2048, raw.contextSize)) : 4096
  };
}
function toChatMessages(messages, visionReady) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 40)
    throw new Error('Invalid conversation history');
  return messages.map(item => {
    if (!['system','user','assistant'].includes(item.role)) throw new Error('Unknown message role');
    const content = typeof item.content === 'string' ? item.content : '';
    if (Array.isArray(item.images) && item.images.length) {
      if (!visionReady) throw new Error('Local vision needs a compatible multimodal GGUF and projector (mmproj).');
      const image = item.images[0];
      if (typeof image !== 'string' || image.length > 3 * 1024 * 1024)
        throw new Error('Invalid local screen image');
      return { role: item.role, content: [
        { type: 'text', text: content.slice(0, 6000) },
        { type: 'image_url', image_url: { url: image.startsWith('data:image/') ? image : 'data:image/png;base64,' + image } }
      ] };
    }
    return { role: item.role, content: content.slice(0, 12000) };
  });
}
async function parseSSE(response, onDelta, signal) {
  if (!response.body?.getReader) throw new Error('Local model returned no streaming body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', text = '', done = false;
  try {
    while (!done) {
      if (signal?.aborted) throw new Error('Conversation interrupted');
      const next = await reader.read();
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      if (buffer.length > 400000) throw new Error('Local AI stream exceeded message size');
      const pieces = buffer.split(/\r?\n\r?\n/);
      buffer = pieces.pop() || '';
      for (const packet of pieces) {
        const data = packet.split(/\r?\n/).filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trim()).join('');
        if (!data) continue;
        if (data === '[DONE]') { done = true; break; }
        let json;
        try { json = JSON.parse(data); } catch { continue; }
        if (json.error) throw new Error('Local AI: ' + String(json.error.message || json.error).slice(0, 220));
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          const remaining = MAX_REPLY - text.length;
          if (remaining <= 0) { done = true; break; }
          const safeDelta = delta.slice(0, remaining);
          text += safeDelta;
          if (onDelta) onDelta(safeDelta);
        }
      }
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }
  return text.trim();
}
class MyaLocalEngine {
  constructor({ configPath, runtimeDir = path.join(__dirname,'runtime'),
    fetchImpl = fetch, spawnImpl = spawn, port = PORT } = {}) {
    if (!configPath) throw new Error('Local runtime needs its private config path');
    this.configPath = configPath;
    this.runtimeDir = runtimeDir;
    this.fetchImpl = fetchImpl;
    this.spawnImpl = spawnImpl;
    this.port = port;
    this.baseUrl = 'http://' + HOST + ':' + port;
    this.child = null;
    this.state = 'stopped';
    this.lastError = '';
    this.starting = null;
    this.stderrTail = '';
    this.apiKey = '';
    this.canceled = false;
    this.config = this.loadConfig();
  }
  loadConfig() {
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(this.configPath, 'utf8')); }
    catch {}
    const config = normalizeConfig(saved);
    // Optional portable offline layout: users can place the official engine
    // and their own GGUF in desktop/runtime instead of browsing for them.
    const folder = this.runtimeDir;
    const engineCandidate = path.join(folder,
      process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
    if ((!config.enginePath || !isLlamaServer(config.enginePath)) &&
        isLlamaServer(engineCandidate)) config.enginePath = engineCandidate;
    if (!config.modelPath || !isGGUF(config.modelPath)) {
      const dir = path.join(folder, 'models');
      try {
        const models = fs.readdirSync(dir).filter(file => isGGUF(path.join(dir, file)));
        if (models.length === 1) config.modelPath = path.join(dir, models[0]);
      } catch {}
    }
    return config;
  }
  hasRuntime() {
    return isLlamaServer(this.config.enginePath) && isGGUF(this.config.modelPath);
  }
  setFile(kind, filename) {
    const keys = { engine:'enginePath', model:'modelPath', projector:'projectorPath' };
    if (!(kind in keys)) throw new Error('Invalid engine file selection');
    if (kind === 'engine' && !isLlamaServer(filename))
      throw new Error('Choose llama-server.exe from an official llama.cpp Windows release.');
    if (kind !== 'engine' && !isGGUF(filename))
      throw new Error('Choose a valid GGUF model file (or compatible mmproj GGUF).');
    if (this.child || this.starting) throw new Error('Stop Mya AI before changing the engine or model.');
    this.config[keys[kind]] = filename;
    this.saveConfig();
    return this.status();
  }
  configureOptions(options = {}) {
    if (this.child || this.starting) throw new Error('Stop Mya AI before changing inference settings');
    this.config = normalizeConfig({ ...this.config,
      gpuLayers: options.gpuLayers ?? this.config.gpuLayers,
      contextSize: options.contextSize ?? this.config.contextSize });
    this.saveConfig();
    return this.status();
  }
  clearProjector() {
    if (this.child || this.starting) throw new Error('Stop Mya AI before changing the projector');
    this.config.projectorPath = '';
    this.saveConfig();
    return this.status();
  }
  saveConfig() {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const temp = this.configPath + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.config, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.configPath);
  }
  status() {
    return {
      state: this.state,
      ready: this.state === 'ready' && !!this.child,
      engineSelected: !!this.config.enginePath,
      engineName: this.config.enginePath ? path.basename(this.config.enginePath) : '',
      modelSelected: !!this.config.modelPath,
      modelName: this.config.modelPath ? path.basename(this.config.modelPath) : '',
      projectorSelected: !!this.config.projectorPath,
      projectorName: this.config.projectorPath ? path.basename(this.config.projectorPath) : '',
      gpuLayers: this.config.gpuLayers,
      contextSize: this.config.contextSize,
      lastError: this.lastError.slice(0, 400),
      // Paths are private local settings; do not return them to web search.
      provider: 'Mya Local (llama.cpp)',
      port: this.port
    };
  }
  async _health(timeoutMs = 1500) {
    try {
      const response = await this.fetchImpl(this.baseUrl + '/health', {
        headers: this.apiKey ? {Authorization:'Bearer '+this.apiKey} : {},
        signal: AbortSignal.timeout(timeoutMs), redirect: 'error'
      });
      if (!response.ok) return false;
      const data = await response.json();
      return data.status === 'ok' || data.status === 'ready' ||
        data.status === 'healthy' || data.status === 'loading model' && false;
    } catch { return false; }
  }
  async start() {
    if (this.state === 'ready' && this.child) return this.status();
    if (this.starting) return this.starting;
    const {enginePath,modelPath,projectorPath,gpuLayers,contextSize} = this.config;
    if (!isLlamaServer(enginePath))
      throw new Error('Select the llama-server.exe executable first.');
    if (!isGGUF(modelPath)) throw new Error('Select a valid local GGUF model first.');
    if (projectorPath && !isGGUF(projectorPath))
      throw new Error('Selected vision projector is not a valid GGUF file.');
    this.state = 'starting';
    this.canceled = false;
    this.lastError = '';
    this.apiKey = crypto.randomBytes(28).toString('hex');
    this.starting = (async () => {
      const portBusy = await this._health(500);
      if (this.canceled) return this.status();
      if (portBusy) throw new Error('Inference port ' + this.port + ' is occupied by another server. Close it first.');
      const args = ['--model', modelPath, '--host', HOST, '--port', String(this.port),
        '--ctx-size', String(contextSize), '--n-gpu-layers', String(gpuLayers),
        '--alias', 'mya', '--no-webui'];
      if (projectorPath) args.push('--mmproj', projectorPath);
      const child = this.spawnImpl(enginePath, args, {
        cwd: path.dirname(enginePath), windowsHide: true, stdio: ['ignore','pipe','pipe'],
        shell: false, env: { ...process.env, LLAMA_API_KEY: this.apiKey }
      });
      this.child = child;
      this.stderrTail = '';
      const onOutput = chunk => {
        this.stderrTail = (this.stderrTail + String(chunk)).slice(-3500);
      };
      child.stdout?.on('data', onOutput);
      child.stderr?.on('data', onOutput);
      child.on('error', error => {
        this.lastError = 'Local inference engine could not start: ' + error.message;
        if (this.child === child) this.child = null;
        this.state = 'error';
      });
      child.on('exit', (code, signal) => {
        if (this.child === child) {
          this.child = null;
          if (this.state !== 'stopped') {
            this.lastError = 'Mya AI stopped (' + (code ?? signal ?? 'unknown') + '). ' +
              this.stderrTail.slice(-600);
            this.state = 'error';
          }
        }
      });
      const began = Date.now();
      while (Date.now() - began < READY_TIMEOUT_MS) {
        if (this.canceled) return this.status();
        if (!this.child || this.state === 'error')
          throw new Error(this.lastError || 'Local inference engine exited before loading the model.');
        if (await this._health()) {
          this.state = 'ready';
          return this.status();
        }
        await new Promise(resolve => setTimeout(resolve, 700));
      }
      throw new Error('Mya could not finish loading the local model. Engine output: ' +
        this.stderrTail.slice(-650));
    })().catch(error => {
      if (this.canceled) {
        this.state = 'stopped';
        this.lastError = '';
        return this.status();
      }
      this.lastError = error.message;
      this.stop();
      this.state = 'error';
      throw error;
    }).finally(() => { this.starting = null; });
    return this.starting;
  }
  stop() {
    this.canceled = true;
    this.state = 'stopped';
    this.apiKey = '';
    if (this.child) {
      const child = this.child;
      this.child = null;
      try { child.kill(); } catch {}
    }
    return this.status();
  }
  async complete(messages, { signal, numPredict = 350, temperature = 0.7, onDelta = null } = {}) {
    if (this.state !== 'ready' || !this.child)
      throw new Error(this.state === 'starting'
        ? 'Mya is waking up. Her local language model is still loading.'
        : this.hasRuntime()
          ? 'Mya’s local intelligence could not start. Check diagnostics for the error.'
          : 'This development build does not include Mya’s local language-model files yet. A complete Mya build must package her brain.');
    const request = {
      model: 'mya',
      messages: toChatMessages(messages, !!this.config.projectorPath),
      chat_template_kwargs: {enable_thinking:false},
      temperature: Math.min(1.5, Math.max(0, Number(temperature) || 0.7)),
      max_tokens: Math.min(1400, Math.max(40, Number(numPredict) || 350)),
      stream: !!onDelta
    };
    const response = await this.fetchImpl(this.baseUrl + '/v1/chat/completions', {
      method: 'POST', headers: {
        'Content-Type':'application/json',
        Authorization: 'Bearer ' + this.apiKey
      },
      body: JSON.stringify(request), signal, redirect: 'error'
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 300);
      throw new Error('Mya local model returned HTTP ' + response.status + ': ' + body);
    }
    if (onDelta) return parseSSE(response, onDelta, signal);
    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content;
    if (typeof answer !== 'string') throw new Error('Local model returned no text.');
    return answer.trim().slice(0, MAX_REPLY);
  }
}
module.exports = { MyaLocalEngine, isGGUF, isLlamaServer, toChatMessages, parseSSE, normalizeConfig };
