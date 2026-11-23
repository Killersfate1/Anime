'use strict';

const crypto = require('node:crypto');

// Validate the actual GLB structure before accepting a new avatar. The
// original model remains canonical until the user explicitly approves
// a different, skinned model. Do not render external image/buffer URLs.
function inspectGlb(data, maxBytes = 100 * 1024 * 1024) {
  const fail = reason => ({ valid: false, reason });
  if (!Buffer.isBuffer(data) && !(data instanceof Uint8Array))
    return fail('Expected GLB bytes');
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (bytes.length < 20 || bytes.length > maxBytes)
    return fail('GLB must be between 20 bytes and 100 MB');
  if (bytes.toString('ascii', 0, 4) !== 'glTF' ||
      bytes.readUInt32LE(4) !== 2 ||
      bytes.readUInt32LE(8) !== bytes.length)
    return fail('Invalid glTF 2.0 GLB header or length');

  let offset = 12;
  let jsonChunk = null;
  let binLength = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length)
      return fail('Truncated GLB chunk header');
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    offset += 8;
    if (length % 4 !== 0 || length > bytes.length - offset)
      return fail('Malformed or truncated GLB chunk');
    if (jsonChunk === null) {
      if (type !== 0x4e4f534a) return fail('First GLB chunk is not JSON');
      jsonChunk = bytes.subarray(offset, offset + length);
    } else if (type === 0x004e4942) {
      binLength += length;
    }
    offset += length;
  }
  if (!jsonChunk) return fail('Missing GLB JSON chunk');

  let document;
  try {
    document = JSON.parse(jsonChunk.toString('utf8').replace(/[\x00\x20]+$/g, ''));
  } catch {
    return fail('Invalid GLB JSON');
  }
  if (document?.asset?.version !== '2.0') return fail('Unsupported glTF asset version');
  if (!Array.isArray(document.meshes) || document.meshes.length === 0)
    return fail('GLB has no character meshes');
  if (!Array.isArray(document.skins) || document.skins.length === 0 ||
      !document.skins.some(s => Array.isArray(s.joints) && s.joints.length >= 10))
    return fail('GLB has no usable skinned character rig');
  if (!Array.isArray(document.nodes) || document.nodes.length === 0)
    return fail('GLB has no skeleton hierarchy');
  for (const entry of [...(document.buffers || []), ...(document.images || [])]) {
    if (typeof entry.uri === 'string' && !entry.uri.startsWith('data:'))
      return fail('External buffer or image URLs are not allowed; embed textures in GLB');
  }
  if ((document.buffers || []).some(b => !b.uri && (Number(b.byteLength) || 0) > binLength))
    return fail('Declared GLB binary buffer exceeds embedded data');

  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  return {
    valid: true,
    sha256: hash,
    sizeBytes: bytes.length,
    meshes: document.meshes.length,
    skins: document.skins.length,
    joints: Math.max(...document.skins.map(s => s.joints?.length || 0)),
    morphTargets: document.meshes.reduce((count, mesh) =>
      count + (mesh.primitives || []).reduce((n, p) => n + (p.targets?.length || 0), 0), 0),
    vrmVersion: document.extensions?.VRMC_vrm ? '1.0' :
      document.extensions?.VRM ? '0.x' : null
  };
}

function inspectAvatar(data, filenameExtension) {
  const extension = String(filenameExtension || '').toLowerCase().replace(/^\\./, '');
  if (extension !== 'glb' && extension !== 'vrm')
    return { valid: false, reason: 'Only .glb and .vrm avatars are supported' };
  const inspection = inspectGlb(data);
  if (!inspection.valid) return inspection;
  if (extension === 'vrm' && !inspection.vrmVersion)
    return { valid: false, reason: 'This .vrm does not contain a VRM 0.x or 1.0 extension' };
  return { ...inspection, extension,
    format: inspection.vrmVersion ? 'VRM ' + inspection.vrmVersion : 'glTF 2.0 GLB' };
}

module.exports = { inspectGlb, inspectAvatar };
