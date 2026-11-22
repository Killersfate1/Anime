'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compareFrames } = require('./screen-change.cjs');

test('first frame requires analysis', () => {
  assert.equal(compareFrames(null, Buffer.alloc(96 * 54 * 4)).changed, true);
});
test('identical frames do not trigger a second model request', () => {
  const frame = Buffer.alloc(96 * 54 * 4);
  assert.equal(compareFrames(frame, Buffer.from(frame)).changed, false);
});
test('visible changes trigger model analysis', () => {
  const original = Buffer.alloc(96 * 54 * 4);
  const changed = Buffer.from(original);
  for(let i=0;i<changed.length/10;i++) changed[i]=255;
  assert.equal(compareFrames(original, changed).changed, true);
});
test('small sub-pixel changes are ignored', () => {
  const original = Buffer.alloc(96 * 54 * 4);
  const changed = Buffer.alloc(96 * 54 * 4, 1);
  assert.equal(compareFrames(original, changed).changed, false);
});
