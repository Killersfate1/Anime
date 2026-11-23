'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectGlb, inspectAvatar } = require('./avatar-validation.cjs');

function makeGlb(overrides = {}) {
  const document = {
    asset: { version: '2.0' },
    nodes: Array.from({ length: 16 }, (_, i) => ({ name: 'Bone' + i })),
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    skins: [{ joints: Array.from({ length: 12 }, (_, i) => i) }],
    buffers: [{ byteLength: 8 }],
    ...overrides
  };
  const json = Buffer.from(JSON.stringify(document), 'utf8');
  const paddedJson = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(paddedJson);
  const bin = Buffer.alloc(8);
  const bytes = Buffer.alloc(12 + 8 + paddedJson.length + 8 + bin.length);
  bytes.write('glTF', 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(paddedJson.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  paddedJson.copy(bytes, 20);
  const offset = 20 + paddedJson.length;
  bytes.writeUInt32LE(bin.length, offset);
  bytes.writeUInt32LE(0x004e4942, offset + 4);
  bin.copy(bytes, offset + 8);
  return bytes;
}

test('accepts a complete, skinned glTF 2.0 GLB independently of a fixed hash', () => {
  const original = inspectGlb(makeGlb());
  const modified = inspectGlb(makeGlb({ nodes: Array.from({ length: 18 }, () => ({})) }));
  assert.equal(original.valid, true);
  assert.equal(modified.valid, true);
  assert.notEqual(original.sha256, modified.sha256);
  assert.equal(original.joints, 12);
});
test('rejects malformed/truncated headers and chunks', () => {
  const file = makeGlb();
  const corrupted = Buffer.from(file);
  corrupted.writeUInt32LE(file.length + 20, 8);
  assert.equal(inspectGlb(corrupted).valid, false);
  assert.equal(inspectGlb(file.subarray(0, file.length - 2)).valid, false);
});
test('rejects models without skeletons and external assets', () => {
  assert.match(inspectGlb(makeGlb({ skins: [] })).reason, /skinned/i);
  assert.match(inspectGlb(makeGlb({ images: [{ uri: 'https://bad.example/image.png' }] })).reason, /External/i);
});
test('rejects GLB binary buffers that are not embedded', () => {
  assert.equal(inspectGlb(makeGlb({ buffers: [{ byteLength: 5000 }] })).valid, false);
});

test('accepts VRM 0.x and VRM 1.0 with humanoid rigs', () => {
  const vrm0 = inspectAvatar(makeGlb({ extensions: { VRM: { specVersion: '0.0' } } }), '.vrm');
  const vrm1 = inspectAvatar(makeGlb({ extensions: { VRMC_vrm: { specVersion: '1.0' } } }), '.VRM');
  assert.equal(vrm0.valid, true);
  assert.equal(vrm0.extension, 'vrm');
  assert.equal(vrm0.vrmVersion, '0.x');
  assert.equal(vrm1.valid, true);
  assert.equal(vrm1.vrmVersion, '1.0');
});
test('keeps GLB compatibility and rejects mislabeled VRM files', () => {
  assert.equal(inspectAvatar(makeGlb(), '.glb').valid, true);
  assert.match(inspectAvatar(makeGlb(), '.vrm').reason, /VRM 0.x or 1.0/);
  assert.equal(inspectAvatar(makeGlb(), '.obj').valid, false);
});
