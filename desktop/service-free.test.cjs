'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = local => fs.readFileSync(path.join(__dirname, local), 'utf8');

test('Mya UI has no external AI connection/setup panel', () => {
  const html = read('index.html');
  assert.match(html, /Mya's mind/);
  assert.match(html, /engine-status/);
  for (const oldId of [
    'choose-engine','choose-gguf','get-engine-link','get-model-link',
    'engine-start','engine-stop','engine-gpu-layers','engine-context',
    'choose-projector','clear-projector'
  ]) assert.doesNotMatch(html, new RegExp('id="' + oldId + '"'));
  assert.doesNotMatch(html, /Connect to Convai|Start Mya AI|Select an AI provider/);
});

test('renderer exposes only readiness, not service connection controls', () => {
  const js = read('renderer.mjs');
  assert.match(js, /refreshEngineStatus/);
  for (const obsolete of [
    'chooseEngineFile(', 'openEngineResource(', 'configureEngine(',
    'clearProjector(', 'startEngine(', 'stopEngine('
  ]) assert.equal(js.includes(obsolete), false, obsolete);
});

test('Electron IPC no longer offers cloud-service or manual AI setup controls', () => {
  const main = read('main.cjs');
  const preload = read('preload.cjs');
  for (const channel of [
    'mya:engine-choose','mya:engine-resource','mya:engine-options',
    'mya:engine-start','mya:engine-stop','mya:engine-clear-projector'
  ]) assert.equal(main.includes(channel) || preload.includes(channel), false, channel);
  assert.match(main, /localEngine\.start\(\)/);
  assert.match(preload, /mya:engine-status/);
});

test('custom Unity Convai cloud-connect preview is gone', () => {
  for (const old of [
    'Assets/Relay/Editor/MyaConvaiBind.cs',
    'Assets/Relay/Editor/RelayConvaiSetup.cs',
    'Assets/Relay/Scripts/RelayConvaiCompanion.cs',
    'Assets/Relay/Scenes/ConvaiPreview.unity'
  ]) assert.equal(fs.existsSync(path.join(root, old)), false, old);
});
