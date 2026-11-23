// Runs Kokoro TTS in a Node Worker, completely separate from the Electron
// renderer and the game loop. Text/voice stay local after model installation.
// Models are fetched from Hugging Face only on explicit Install Voice action.
import { parentPort, workerData } from 'node:worker_threads';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICES = new Set(['af_heart','af_bella','af_nicole','af_sarah','af_kore','af_sky','bf_emma','bf_lily']);
let engine = null;
let loading = null;
const canceled = new Set();

function report(type, value = {}) {
  parentPort.postMessage({ type, ...value });
}
async function init(allowDownload) {
  if (engine) return;
  if (loading) return loading;
  loading = (async () => {
    const cacheDir = resolve(workerData.cacheDir);
    await mkdir(cacheDir, { recursive: true });
    const [{ KokoroTTS }, { env }] = await Promise.all([
      import('kokoro-js'), import('@huggingface/transformers')
    ]);
    env.cacheDir = cacheDir;
    env.allowRemoteModels = allowDownload;
    env.allowLocalModels = true;
    report('progress', { message: allowDownload
      ? 'Installing Mya’s Kokoro voice model locally…'
      : 'Loading Mya’s installed neural voice…' });
    const instance = await KokoroTTS.from_pretrained(MODEL, {
      dtype: 'q8', device: 'cpu',
      progress_callback: evt => {
        if (evt?.status === 'progress' && Number.isFinite(evt.progress))
          report('progress', { message: 'Voice model: ' + Math.round(evt.progress) + '%' });
      }
    });
    engine = instance;
  })().finally(() => { loading = null; });
  return loading;
}

parentPort.on('message', async msg => {
  if (msg?.type === 'cancel') {
    canceled.add(msg.id);
    return;
  }
  if (msg?.type === 'init') {
    try {
      await init(msg.allowDownload === true);
      report('ready', { id: msg.id });
    } catch (err) {
      report('error', { id: msg.id, error: String(err?.message || err).slice(0, 350) });
    }
    return;
  }
  if (msg?.type !== 'speak') return;
  try {
    if (!engine) throw Error('Install Mya’s voice in Settings first');
    if (!VOICES.has(msg.voice)) throw Error('Unsupported Mya voice selection');
    if (typeof msg.text !== 'string' || !msg.text.trim() || msg.text.length > 1200)
      throw Error('Voice text must be 1–1200 characters');
    const speed = Math.min(1.3, Math.max(0.8, Number(msg.speed) || 1));
    if (canceled.has(msg.id)) { canceled.delete(msg.id); return; }
    const audio = await engine.generate(msg.text, { voice: msg.voice, speed });
    if (canceled.has(msg.id)) { canceled.delete(msg.id); return; }
    const wav = audio.toWav();
    const bytes = wav instanceof ArrayBuffer
      ? new Uint8Array(wav)
      : new Uint8Array(wav.buffer, wav.byteOffset, wav.byteLength);
    report('audio', { id: msg.id, bytes });
  } catch (err) {
    report('error', { id: msg.id, error: String(err?.message || err).slice(0, 350) });
  }
});
