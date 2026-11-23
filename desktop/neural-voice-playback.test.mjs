import test from 'node:test';
import assert from 'node:assert/strict';
import {speechChunks} from './neural-voice-playback.mjs';
test('speech chunks remove markdown code and links before local synthesis',()=>{
  const out=speechChunks('Hello Mya! Visit https://example.com and ```const secret=1``` just smile.');
  assert.equal(out.length,1);
  assert.equal(out[0].includes('secret'),false);
  assert.equal(out[0].includes('example.com'),false);
});
test('spoken chunks respect size limits and preserve complete speech',()=>{
  const original='Hello there. '.repeat(140);
  const chunks=speechChunks(original,400,9);
  assert.ok(chunks.length>=3);
  assert.ok(chunks.every(x=>x.length<=400));
  assert.equal(chunks.join(' ').replace(/\s+/g,' ').trim(),original.trim());
});
test('empty and excessive conversations do not generate unbounded voice calls',()=>{
  assert.deepEqual(speechChunks(''),[]);
  const chunks=speechChunks('A '.repeat(5000),400,9);
  assert.ok(chunks.length<=9);
});
