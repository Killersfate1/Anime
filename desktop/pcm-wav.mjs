// PCM WAV encoder for a local whisper.cpp transcription server.
// No microphone or network access occurs in this module.
export function encodeMonoWav(samples, sampleRate = 16000) {
  if (!(samples instanceof Float32Array)) throw new TypeError('Expected Float32Array samples');
  if (sampleRate !== 16000) throw new RangeError('Only 16 kHz audio is supported');
  if (!samples.length || samples.length > sampleRate * 16)
    throw new RangeError('Recording must contain 1–16 seconds of 16 kHz audio');
  const output = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(output);
  const label = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  label(0, 'RIFF');
  view.setUint32(4, output.byteLength - 8, true);
  label(8, 'WAVE');
  label(12, 'fmt ');
  view.setUint32(16, 16, true);        // PCM format chunk length
  view.setUint16(20, 1, true);         // PCM
  view.setUint16(22, 1, true);         // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  label(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(sample < 0 ? sample * 32768 : sample * 32767), true);
  }
  return new Uint8Array(output);
}

// Chromium can decode the temporary MediaRecorder Opus/WebM blob, then
// OfflineAudioContext resamples it to a standard 16k mono PCM WAV.
// Raw WebM is never written to disk.
export async function recordedBlobToWav(blob) {
  if (!blob || !blob.size || blob.size > 10 * 1024 * 1024)
    throw new Error('No microphone audio captured or recording too large');
  const context = new AudioContext();
  let decoded;
  try { decoded = await context.decodeAudioData(await blob.arrayBuffer()); }
  finally { await context.close(); }
  if (!decoded.length || decoded.duration > 16.1) throw new Error('Recording must be under 16 seconds');
  const frameCount = Math.max(1, Math.ceil(decoded.duration * 16000));
  const offline = new OfflineAudioContext(1, frameCount, 16000);
  const mono = offline.createBuffer(1, decoded.length, decoded.sampleRate);
  const combined = mono.getChannelData(0);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const source = decoded.getChannelData(channel);
    for (let i = 0; i < source.length; i++) combined[i] += source[i] / decoded.numberOfChannels;
  }
  const bufferSource = offline.createBufferSource();
  bufferSource.buffer = mono;
  bufferSource.connect(offline.destination);
  bufferSource.start(0);
  const output = await offline.startRendering();
  return encodeMonoWav(output.getChannelData(0), 16000);
}
