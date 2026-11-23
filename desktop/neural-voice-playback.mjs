// Plays Mya's locally generated Kokoro WAV in the Electron renderer.
// No audio files are saved. Levels from the actual waveform provide an
// approximate speech-driven mouth opening (not phoneme-specific lip sync).
export function speechChunks(input, maxLength = 400, maxChunks = 9) {
  const clean = String(input ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[*#_`>|]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const chunks = [];
  let remaining = clean;
  while (remaining.length && chunks.length < maxChunks) {
    if (remaining.length <= maxLength) { chunks.push(remaining); break; }
    const part = remaining.slice(0, maxLength + 1);
    const lastSentence = Math.max(part.lastIndexOf('. '),part.lastIndexOf('! '),part.lastIndexOf('? '));
    const lastSpace = part.lastIndexOf(' ');
    const cut = lastSentence > maxLength * 0.35 ? lastSentence + 1 :
      lastSpace > maxLength * 0.5 ? lastSpace : maxLength;
    const chunk = remaining.slice(0,cut).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(cut).trim();
  }
  return chunks;
}
export class MyaVoicePlayer {
  constructor(bridge, {onStart=()=>{},onEnd=()=>{},onError=()=>{},onLevel=()=>{}} = {}) {
    this.bridge=bridge; this.onStart=onStart; this.onEnd=onEnd;
    this.onError=onError; this.onLevel=onLevel;
    this.generation=0; this.audio=null; this.url=null;
    this.playDone=null; this.started=false;
    this.audioContext=null; this.analyser=null; this.samples=null;
  }
  async speak(text) {
    this.cancel();
    const generation=++this.generation;
    const chunks=speechChunks(text);
    if (!chunks.length) return false;
    try {
      for (const chunk of chunks) {
        if (generation!==this.generation) return false;
        const result=await this.bridge.synthesizeNeuralVoice(chunk);
        if (generation!==this.generation) return false;
        if (result?.error) throw Error(result.error);
        const data=result?.bytes;
        if (!(data instanceof Uint8Array) && !(data instanceof ArrayBuffer))
          throw Error('Mya voice returned no audio');
        const bytes=data instanceof Uint8Array ? data : new Uint8Array(data);
        if (bytes.length<44) throw Error('Mya voice returned an empty WAV');
        await this._playBytes(bytes,generation);
      }
      if (generation===this.generation) this._finish();
      return true;
    } catch(error) {
      if (generation===this.generation) { this.onError(error.message || String(error)); this._finish(); }
      return false;
    }
  }
  async _playBytes(bytes,generation) {
    if (generation!==this.generation) return;
    const url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
    const audio=new Audio();
    let source=null;
    this.audio=audio; this.url=url;
    audio.preload='auto'; audio.src=url;
    try {
      if (typeof AudioContext!=='undefined') {
        this.audioContext ||= new AudioContext();
        source=this.audioContext.createMediaElementSource(audio);
        this.analyser=this.audioContext.createAnalyser();
        this.analyser.fftSize=512;
        this.samples=new Uint8Array(this.analyser.fftSize);
        source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        await this.audioContext.resume();
      }
      if (generation !== this.generation) return;
      await new Promise((resolve,reject)=>{
        this.playDone=resolve;
        audio.onended=()=>resolve();
        audio.onerror=()=>reject(Error('Mya audio playback failed'));
        audio.onplay=()=>{
          if (!this.started && generation===this.generation) {
            this.started=true; this.onStart();
          }
        };
        audio.play().catch(reject);
      });
    } finally {
      audio.onended=null; audio.onerror=null; audio.onplay=null;
      if (this.audio===audio) this.audio=null;
      audio.pause(); audio.removeAttribute('src'); audio.load();
      URL.revokeObjectURL(url);
      if (this.url===url) this.url=null;
      source?.disconnect();
      this.analyser?.disconnect();
      this.analyser=null; this.samples=null;
      this.playDone=null;
    }
  }
  update() {
    if (!this.audio || this.audio.paused || !this.analyser || !this.samples) return;
    this.analyser.getByteTimeDomainData(this.samples);
    let sum=0;
    for (const sample of this.samples) {
      const x=(sample-128)/128; sum+=x*x;
    }
    const rms=Math.sqrt(sum/this.samples.length);
    this.onLevel(Math.min(1,Math.max(0.05,rms*6)));
  }
  _finish() {
    if (this.started) this.onEnd();
    this.started=false;
  }
  cancel() {
    this.generation++;
    // Cancel pending synthesis; stale completion will not be played.
    try { this.bridge.stopNeuralVoice?.(); } catch {}
    if (this.audio) { this.audio.pause(); this.audio.onended?.(); }
    if (this.playDone) this.playDone();
    this._finish();
  }
  dispose() {
    this.cancel();
    this.audioContext?.close?.().catch?.(()=>{});
    this.audioContext=null;
  }
}
