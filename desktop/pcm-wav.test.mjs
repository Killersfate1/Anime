import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeMonoWav } from './pcm-wav.mjs';

test('produces standard 16kHz mono 16-bit PCM WAV data', () => {
  const output = encodeMonoWav(new Float32Array([0, -1, 1, 0.5]));
  const view = new DataView(output.buffer);
  assert.equal(Buffer.from(output.subarray(0, 4)).toString(), 'RIFF');
  assert.equal(Buffer.from(output.subarray(8, 12)).toString(), 'WAVE');
  assert.equal(view.getUint32(4, true), 44);
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getInt16(44, true), 0);
  assert.equal(view.getInt16(46, true), -32768);
  assert.equal(view.getInt16(48, true), 32767);
  assert.equal(view.getUint32(40, true), 8);
});
test('rejects empty, excess duration or non-16kHz samples', () => {
  assert.throws(() => encodeMonoWav(new Float32Array()), /1–16 seconds/);
  assert.throws(() => encodeMonoWav(new Float32Array(16000 * 17)), /1–16 seconds/);
  assert.throws(() => encodeMonoWav(new Float32Array([0]), 44100), /16 kHz/);
});
