import { recordedBlobToWav } from './pcm-wav.mjs';

// Explicit push-to-talk only. This controller never records in background.
// Stop is available at any time; all microphone tracks are closed promptly.
export class MyaPushToTalk {
  constructor(bridge, onStatus, onText, onError) {
    this.bridge = bridge;
    this.onStatus = onStatus;
    this.onText = onText;
    this.onError = onError;
    this.state = 'idle';
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.timeout = null;
    this.cancelled = false;
  }

  async start() {
    if (this.state !== 'idle') return;
    this.state = 'requesting';
    this.cancelled = false;
    this.onStatus('requesting');
    try {
      const armed = await this.bridge.armMicrophone();
      if (!armed) throw new Error('Microphone access could not be enabled');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
        video: false
      });
      if (this.cancelled) {
        stream.getTracks().forEach(track => track.stop());
        this.state = 'idle';
        this.onStatus('idle');
        return;
      }
      this.stream = stream;
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
      const mimeType = types.find(type => MediaRecorder.isTypeSupported(type));
      this.recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      this.chunks = [];
      this.recorder.ondataavailable = event => {
        if (event.data?.size) this.chunks.push(event.data);
      };
      this.recorder.onerror = event => this.fail(event.error || new Error('Microphone recording failed'));
      this.recorder.onstop = () => this.finishRecording();
      this.recorder.start(250);
      this.state = 'recording';
      this.onStatus('recording');
      this.timeout = setTimeout(() => this.stop(), 15000);
    } catch (error) { await this.fail(error); }
  }

  async stop() {
    if (this.state === 'requesting') {
      this.cancelled = true;
      await this.bridge.disarmMicrophone();
      this.state = 'idle';
      this.onStatus('idle');
      return;
    }
    if (this.state !== 'recording') return;
    this.state = 'processing';
    this.onStatus('processing');
    this.clearTimer();
    this.stream?.getTracks().forEach(track => track.stop());
    try {
      if (this.recorder?.state !== 'inactive') this.recorder.stop();
    } catch (error) { await this.fail(error); }
    await this.bridge.disarmMicrophone();
  }

  async finishRecording() {
    if (this.cancelled) return;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    try {
      const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || 'audio/webm' });
      this.chunks = [];
      if (!blob.size) throw new Error('No microphone audio was recorded');
      this.onStatus('transcribing');
      const wav = await recordedBlobToWav(blob);
      const result = await this.bridge.transcribeMicrophone(wav);
      if (!result?.text) throw new Error(result?.error || 'Local transcription produced no speech');
      await this.onText(result.text);
    } catch (error) { this.onError(error); }
    finally {
      this.recorder = null;
      this.state = 'idle';
      this.onStatus('idle');
    }
  }

  async fail(error) {
    this.cancelled = true;
    this.clearTimer();
    try { if (this.recorder?.state === 'recording') this.recorder.stop(); }
    catch {}
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.state = 'idle';
    try { await this.bridge.disarmMicrophone(); } catch {}
    this.onStatus('idle');
    this.onError(error);
  }

  clearTimer() { if (this.timeout) clearTimeout(this.timeout); this.timeout = null; }
}
