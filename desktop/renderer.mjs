import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { MyaKawaiiAnimation } from './kawaii.mjs';
import { MyaProceduralMotion } from './procedural-motion.mjs';
import { MyaPushToTalk } from './voice.mjs';
import { SpeechSync } from './speech-sync.mjs';
import { MyaFace } from './face.mjs';

const ui = (id) => document.getElementById(id);
const api = window.mya;
const mic = new MyaPushToTalk(
  api,
  (status) => {
    const labels = {
      idle: 'Microphone OFF · Click 🎙 to talk · Requires local whisper.cpp',
      requesting: 'Requesting microphone permission…',
      recording: 'MICROPHONE ON · Click Stop or wait up to 15 seconds',
      processing: 'Recording stopped · Preparing WAV locally…',
      transcribing: 'Microphone OFF · Transcribing on this computer…'
    };
    ui('mic-status').textContent = labels[status] || status;
    ui('mic-status').classList.toggle('mic-active', status === 'recording');
    ui('mic-toggle').textContent = status === 'recording' ? '■ Stop' :
      status === 'idle' ? '🎙' : '✕ Cancel';
    ui('mic-toggle').setAttribute('aria-pressed', status === 'recording' ? 'true' : 'false');
    ui('mic-toggle').disabled = false;
    if (status === 'recording') {
      playMyaGesture('Waiting');
      face?.setEmotion('curious');
    } else if (status === 'transcribing' || status === 'processing') {
      playMyaGesture('Think');
      face?.setEmotion('curious');
    } else if (status === 'idle' && !speaking) {
      face?.setEmotion('neutral');
      playMyaGesture('Idle');
    }
  },
  async (transcript) => {
    ui('chat-input').value = transcript;
    await sendMessage();
  },
  error => toast('Microphone/recognition: ' + (error?.message || String(error)))
);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 1000);
const renderer = new THREE.WebGLRenderer({
  canvas: ui('avatar-canvas'), alpha: true, antialias: true, powerPreference: 'low-power'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.90;
scene.add(new THREE.HemisphereLight(0xffe5fa, 0x55416e, 0.82));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
keyLight.position.set(2.0, 4.5, 3.5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xc289ee, 0.32);
fillLight.position.set(-3.5, 1.4, -3.0);
scene.add(fillLight);

let character = null;
let activeVRM = null;
let vrmBaseYaw = 0;
let kawaii = null;
let procedural = null;
let preferProcedural = false;
function playMyaGesture(name) {
  if (!preferProcedural && kawaii?.ready && kawaii.play(name)) return true;
  return procedural?.play(name) || false;
}
let face = null;
let nextIdleMoment = 0;
let previousAnimationTime = 0;
let head = null;
let eyeBones = [];
let chest = null;
let baseHead = null;
let baseEyes = [];
let baseChest = null;
let modelCenter = new THREE.Vector3();
let viewportDistance = 3;
let characterYaw = 0;
let speaking = false;
let selectedTab = 'chat';
let observing = false;
let observationTimer = null;
let observationBusy = false;
let currentSettings = {};
let animationFrame = 0;
let lastFrameAt = 0;
const clock = new THREE.Clock();
const loader = new GLTFLoader();
loader.register(parser => new VRMLoaderPlugin(parser));
let emotionGestureTimeout = null;

const speechSession = new SpeechSync({
  onStart: ({ emotion }) => {
    speaking = true;
    ui('state').textContent = 'Speaking';
    face?.setTalking(true);
    face?.setEmotion(emotion);
    if (emotionGestureTimeout) clearTimeout(emotionGestureTimeout);
    const gesture = {
      happy: 'Cheer', surprised: 'Surprised', concerned: 'Concerned',
      playful: 'Laugh', curious: 'Think', shy: 'Shy'
    }[emotion];
    if (gesture && playMyaGesture(gesture)) {
      emotionGestureTimeout = setTimeout(() => {
        emotionGestureTimeout = null;
        if (speaking) playMyaGesture('Talk');
      }, 850);
    } else playMyaGesture('Talk');
    nextIdleMoment = performance.now() + 16000;
  },
  onBoundary: ({ viseme, strength }) => face?.setViseme(viseme, strength),
  onEnd: () => {
    if (emotionGestureTimeout) clearTimeout(emotionGestureTimeout);
    emotionGestureTimeout = null;
    speaking = false;
    face?.setTalking(false);
    face?.setEmotion('neutral');
    playMyaGesture('Idle');
    ui('state').textContent = 'Ready';
  },
  onError: error => toast(error)
});
function faceSettings() {
  return {
    enabled: !!currentSettings.mouthEnabled,
    faceBack: !!currentSettings.mouthFaceBack,
    x: currentSettings.mouthX,
    y: currentSettings.mouthY,
    z: currentSettings.mouthZ,
    width: currentSettings.mouthWidth,
    height: currentSettings.mouthHeight
  };
}
function faceDiagnostics() {
  const info = face?.getDiagnostics();
  ui('face-diagnostics').textContent = !info ? 'Import Mya\'s GLB to inspect facial controls.' :
    (info.vrmVersion !== null ? 'VRM v' + info.vrmVersion + ' · Native expressions: ' +
      info.vrmExpressions.length : 'GLB facial morphs: ' + Object.keys(info.morphChannels).length) +
    ' · Jaw: ' + (info.hasJaw ? 'yes' : 'no') +
    ' · Head: ' + (info.hasHead ? 'yes' : 'no') +
    ' · Overlay: ' + (info.fallbackEnabled ? 'ON (approximate)' : 'OFF');
}


function toast(message) {
  ui('toast').textContent = String(message).slice(0, 260);
  ui('toast').classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ui('toast').classList.add('hidden'), 4500);
}
function showTab(tab) {
  selectedTab = tab;
  for (const button of document.querySelectorAll('[data-tab]'))
    button.classList.toggle('active', button.dataset.tab === tab);
  for (const name of ['chat', 'screen', 'settings'])
    ui('tab-' + name).classList.toggle('hidden', name !== tab);
}
function message(text, kind = 'mya') {
  const item = document.createElement('p');
  item.className = kind === 'user' ? 'user-message' : 'mya-message';
  item.textContent = text;
  ui('conversation').appendChild(item);
  ui('conversation').scrollTop = ui('conversation').scrollHeight;
}
function moveToRest() {
  if (!character) return;
  character.rotation.y = characterYaw;
  const box = new THREE.Box3().setFromObject(character);
  const size = box.getSize(new THREE.Vector3());
  modelCenter = box.getCenter(new THREE.Vector3());
  const fov = THREE.MathUtils.degToRad(camera.fov);
  viewportDistance = Math.max(0.5, 1.12 * Math.max(size.y, size.x * 1.5) / (2 * Math.tan(fov / 2)));
  camera.position.set(modelCenter.x, modelCenter.y + size.y * 0.04, modelCenter.z + viewportDistance);
  camera.lookAt(modelCenter);
  camera.near = Math.max(0.01, viewportDistance / 100);
  camera.far = viewportDistance * 15;
  camera.updateProjectionMatrix();
}
function applyAvatar(gltf) {
  speechSession.cancel();
  if (face) { face.dispose(); face = null; }
  if (kawaii) { kawaii.dispose(); kawaii = null; }
  if (procedural) { procedural.dispose(); procedural = null; }
  if (character) {
    scene.remove(character);
    character.traverse(object => {
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material :
        object.material ? [object.material] : [];
      for (const material of materials) material.dispose?.();
    });
  }
  activeVRM = gltf.userData?.vrm || null;
  if (activeVRM?.meta?.metaVersion === '0') VRMUtils.rotateVRM0(activeVRM);
  character = activeVRM?.scene || gltf.scene;
  vrmBaseYaw = character.rotation.y;
  scene.add(character);
  face = new MyaFace(character, faceSettings(), activeVRM);
  faceDiagnostics();
  // Preserve the uploaded material assignments and mesh hierarchy.
  character.traverse((node) => {
    if (node.isMesh) { node.frustumCulled = false; }
  });
  head = null;
  chest = null;
  eyeBones = [];
  character.traverse((node) => {
    const name = node.name.toLowerCase();
    if (!head && /^head(_|$)/i.test(name)) head = node;
    if (!chest && /^chest(_|$)/i.test(name)) chest = node;
    if (/^eye\.[lr]_/i.test(name)) eyeBones.push(node);
  });
  baseHead = head?.quaternion.clone() || null;
  baseChest = chest?.quaternion.clone() || null;
  baseEyes = eyeBones.map(node => node.quaternion.clone());
  characterYaw = vrmBaseYaw;
  moveToRest();
  ui('avatar-empty').classList.add('hidden');
  ui('avatar-status').textContent = activeVRM
    ? 'Mya · VRM ' + (activeVRM.meta?.metaVersion || '') + ' · Kawaii loading…'
    : head ? 'Mya · GLB · Kawaii loading…' : 'Mya · GLB loaded (rig check required)';
  procedural = new MyaProceduralMotion(character, activeVRM);
  kawaii = new MyaKawaiiAnimation(character, activeVRM);
  nextIdleMoment = performance.now() + 12000;
  const loadingController = kawaii;
  kawaii.loadAll(api, text => {
    if (kawaii === loadingController) ui('avatar-status').textContent = text;
  }).then(ok => {
    if (kawaii !== loadingController) return;
    if (!ok) {
      ui('avatar-status').textContent = 'Fallback movement active; Kawaii retarget needs calibration';
      toast('Mya is using basic fallback movement. Kawaii FBX retarget still needs fixing.');
    } else if (kawaii.failed.length) {
      console.warn('Mya Kawaii retarget warnings:', kawaii.failed);
      toast(kawaii.failed.length + ' Kawaii clips need calibration; check the Console.');
    }
  }).catch(error => {
    if (kawaii === loadingController)
      ui('avatar-status').textContent = 'Fallback movement active · ' + error.message;
  });
}
async function loadModel() {
  try {
    const data = await api.loadModel();
    if (!data) {
      ui('avatar-empty').classList.remove('hidden');
      ui('avatar-status').textContent = 'Import GLB or VRM';
      return;
    }
    // IPC sends binary bytes directly. Avoid multi-megabyte base64 strings,
    // atob() allocations and a second expensive byte-by-byte copy.
    const payload = data.bytes;
    const binary = payload instanceof ArrayBuffer ? payload :
      ArrayBuffer.isView(payload) ?
        payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) :
        null;
    if (!binary) throw new Error('The avatar importer returned no GLB/VRM binary data');
    loader.parse(binary, '', gltf => {
      if (data.vrmVersion && !gltf.userData?.vrm) {
        toast('VRM metadata was found, but the VRM loader could not initialize this character.');
        return;
      }
      applyAvatar(gltf);
    }, error => toast('Character load failed: ' + error.message));
  } catch (error) { toast('GLB read failed: ' + error.message); }
}
function frame(t) {
  animationFrame = requestAnimationFrame(frame);
  const interval = currentSettings.economyMode ? 1000 / 30 : 1000 / 60;
  if (t - lastFrameAt < interval) return;
  lastFrameAt = t;
  const elapsed = clock.getElapsedTime();
  const delta = previousAnimationTime ? Math.min((t - previousAnimationTime) / 1000, 0.05) : 0.016;
  previousAnimationTime = t;
  const useKawaii = !preferProcedural && kawaii?.ready;
  if (useKawaii) kawaii.update(delta);
  else procedural?.update(delta);
  if (!speaking && t > nextIdleMoment) {
    const choices = ['Idle', 'Idle', 'LookAround', 'Waiting', 'Stretch'];
    playMyaGesture(choices[Math.floor(Math.random() * choices.length)]);
    nextIdleMoment = t + 14000 + Math.random() * 14000;
  }
  // The fallback maintains coherent idle motion when Kawaii retarget is
  // missing. Do not apply separate GLB bone oscillations on top of it.
  face?.update(delta);
  // VRM.update drives native expressions, spring bones, node constraints and
  // other VRM-supported dynamic components. Keep this after face input.
  activeVRM?.update(delta);
  renderer.render(scene, camera);
}
function resize() {
  const rect = ui('avatar-stage').getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
new ResizeObserver(resize).observe(ui('avatar-stage'));
resize();
requestAnimationFrame(frame);

function say(text) {
  if (!speechSession.speak(text, { enabled: currentSettings.voiceEnabled })) {
    speaking = false;
    face?.setTalking(false);
    playMyaGesture('Idle');
  }
}
async function sendMessage() {
  const input = ui('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  message(text, 'user');
  ui('state').textContent = 'Thinking';
  playMyaGesture('Think');
  ui('send').disabled = true;
  try {
    const result = await api.askLocalAI(text);
    if (result.error) { toast(result.error); message(result.error); }
    else { message(result.text); say(result.text); }
  } catch (error) { toast(error.message); }
  finally { ui('send').disabled = false; if (!speaking) ui('state').textContent = 'Ready'; }
}
function setWatching(value) {
  observing = value;
  ui('watch-indicator').textContent = value ? 'WATCHING' : 'OFF';
  ui('watch-indicator').classList.toggle('on', value);
  ui('start-watch').disabled = value;
  ui('stop-watch').disabled = !value;
  if (!value && observationTimer) clearInterval(observationTimer);
  observationTimer = null;
}
async function refreshSources() {
  try {
    const sources = await api.selectSources();
    const select = ui('source-picker');
    select.replaceChildren();
    const first = document.createElement('option');
    first.value = '';
    first.textContent = 'Choose a window or display';
    select.appendChild(first);
    for (const source of sources) {
      const option = document.createElement('option');
      option.value = source.id;
      option.textContent = source.name;
      select.appendChild(option);
    }
  } catch (error) { toast('Could not list windows: ' + error.message); }
}
async function observationSample() {
  if (!observing || observationBusy) return;
  observationBusy = true;
  try {
    const result = await api.observe();
    if (result.observationEnabled === false) {
      setWatching(false);
      ui('observation').textContent = result.error || 'Screen observation stopped.';
      return;
    }
    if (result.error) {
      ui('observation').textContent = result.error;
      return;
    }
    if (result.busy || result.tooSoon) return;
    const summary = result.summary || 'No clear visual events detected.';
    ui('observation').textContent = (result.activity ? result.activity + ': ' : '') + summary;
    if (result.shouldSpeak && result.proposedComment && !currentSettings.quietMode) {
      message(result.proposedComment);
      const gesture = {
        victory: 'Cheer', defeat: 'Concerned', repeated_error: 'Concerned',
        funny_moment: 'Laugh', interesting_discovery: 'Think', unexpected_event: 'Surprised'
      }[result.event];
      if (gesture) playMyaGesture(gesture);
      if (currentSettings.voiceEnabled) setTimeout(() => say(result.proposedComment), 750);
    }
  } catch (error) {
    ui('observation').textContent = 'Vision is unavailable: ' + error.message;
  } finally { observationBusy = false; }
}
async function startWatching() {
  const selected = ui('source-picker').value;
  if (!selected) { toast('Choose a window or screen first.'); return; }
  try {
    const ok = await api.startObservation(selected);
    if (!ok) { toast('Screen permission not granted.'); return; }
    setWatching(true);
    ui('observation').textContent = 'Observation enabled · local analysis only.';
    await observationSample();
    observationTimer = setInterval(observationSample, 16000);
  } catch (error) { toast('Screen observation failed: ' + error.message); }
}
async function stopWatching() {
  await api.stopObservation();
  setWatching(false);
  ui('observation').textContent = 'Screen observation is disabled.';
}
async function loadSettings() {
  currentSettings = await api.settings();
  ui('chat-model').value = currentSettings.chatModel;
  ui('vision-model').value = currentSettings.visionModel;
  ui('talkativeness').value = currentSettings.talkativeness;
  ui('voice-enabled').checked = currentSettings.voiceEnabled;
  ui('economy-mode').checked = currentSettings.economyMode;
  ui('quiet-mode').checked = currentSettings.quietMode;
  for (const [field, key] of [
    ['mouth-x', 'mouthX'], ['mouth-y', 'mouthY'], ['mouth-z', 'mouthZ'],
    ['mouth-width', 'mouthWidth'], ['mouth-height', 'mouthHeight']
  ]) ui(field).value = currentSettings[key];
  ui('mouth-enabled').checked = !!currentSettings.mouthEnabled;
  ui('mouth-face-back').checked = !!currentSettings.mouthFaceBack;
  face?.setFallback(faceSettings());
  faceDiagnostics();
}
async function saveSettings() {
  try {
    currentSettings = await api.updateSettings({
      chatModel: ui('chat-model').value,
      visionModel: ui('vision-model').value,
      talkativeness: Number(ui('talkativeness').value),
      voiceEnabled: ui('voice-enabled').checked,
      economyMode: ui('economy-mode').checked,
      quietMode: ui('quiet-mode').checked,
      mouthEnabled: ui('mouth-enabled').checked,
      mouthFaceBack: ui('mouth-face-back').checked,
      mouthX: Number(ui('mouth-x').value),
      mouthY: Number(ui('mouth-y').value),
      mouthZ: Number(ui('mouth-z').value),
      mouthWidth: Number(ui('mouth-width').value),
      mouthHeight: Number(ui('mouth-height').value)
    });
    if (currentSettings.quietMode) setWatching(false);
    await loadSettings();
    toast('Settings saved.');
  } catch (error) { toast('Settings error: ' + error.message); }
}
let editingMemoryId = null;
function resetMemoryEditor() {
  editingMemoryId = null;
  ui('memory-text').value = '';
  ui('memory-kind').value = 'note';
  ui('remember').textContent = 'Save';
  ui('cancel-memory-edit').classList.add('hidden');
}
async function updateMemories() {
  const memories = await api.getMemories();
  ui('memory-count').textContent = memories.length + ' user-approved memories saved';
  const list = ui('memory-list');
  list.replaceChildren();
  for (const entry of memories.slice().reverse()) {
    const row = document.createElement('div');
    row.className = 'memory-entry';
    const body = document.createElement('div');
    body.className = 'memory-entry-body';
    const kind = document.createElement('span');
    kind.className = 'memory-entry-kind';
    kind.textContent = (entry.kind || 'note').replace('_', ' ');
    const content = document.createElement('span');
    content.textContent = entry.content;
    body.append(kind, content);
    const edit = document.createElement('button');
    edit.textContent = 'Edit';
    edit.title = 'Edit this saved memory';
    edit.addEventListener('click', () => {
      editingMemoryId = entry.id;
      ui('memory-text').value = entry.content;
      ui('memory-kind').value = entry.kind || 'note';
      ui('remember').textContent = 'Update';
      ui('cancel-memory-edit').classList.remove('hidden');
      ui('memory-text').focus();
    });
    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.title = 'Delete this saved memory';
    remove.addEventListener('click', async () => {
      const result = await api.deleteMemory(entry.id);
      if (!result.ok) { toast('Memory could not be deleted'); return; }
      if (editingMemoryId === entry.id) resetMemoryEditor();
      await updateMemories();
    });
    row.append(body, edit, remove);
    list.append(row);
  }
}
async function importModel() {
  try {
    const info = await api.importModel();
    if (info) { await loadModel(); toast('Original GLB imported locally. SHA-256: ' + info.sha256.slice(0, 12)); }
  } catch (error) { toast(error.message); }
}
for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => showTab(button.dataset.tab));
ui('send').addEventListener('click', sendMessage);
ui('clear-chat').addEventListener('click', async () => {
  const result = await api.clearSessionChat();
  if (!result.ok) { toast(result.error || 'Could not clear session'); return; }
  ui('conversation').replaceChildren();
  message('New session. I won’t keep that conversation as context. ♡');
});
ui('mic-toggle').addEventListener('click', async () => {
  if (mic.state === 'recording') { await mic.stop(); return; }
  if (mic.state !== 'idle') { await mic.cancel(); return; }
  // Interrupt Mya so speech doesn't contaminate the user's recording.
  speechSession.cancel();
  playMyaGesture('Idle');
  await mic.start();
});
ui('chat-input').addEventListener('keydown', event => { if (event.key === 'Enter') sendMessage(); });
ui('import-model').addEventListener('click', importModel);
ui('change-avatar').addEventListener('click', importModel);
ui('avatar-recenter').addEventListener('click', () => { characterYaw = vrmBaseYaw; moveToRest(); });
ui('refresh-sources').addEventListener('click', refreshSources);
ui('start-watch').addEventListener('click', startWatching);
ui('stop-watch').addEventListener('click', stopWatching);
ui('save-settings').addEventListener('click', saveSettings);
function previewMouthSettings() {
  face?.setFallback({
    enabled: ui('mouth-enabled').checked,
    faceBack: ui('mouth-face-back').checked,
    x: Number(ui('mouth-x').value),
    y: Number(ui('mouth-y').value),
    z: Number(ui('mouth-z').value),
    width: Number(ui('mouth-width').value),
    height: Number(ui('mouth-height').value)
  });
  faceDiagnostics();
}
for (const field of ['mouth-enabled', 'mouth-face-back', 'mouth-x', 'mouth-y', 'mouth-z', 'mouth-width', 'mouth-height'])
  ui(field).addEventListener('input', previewMouthSettings);
ui('preview-voice').addEventListener('click', () => {
  if (!character) { toast('Import Mya\'s GLB or VRM first'); return; }
  // Test requires no AI server or microphone permissions.
  speechSession.speak('Hey! I am Mya! This is my voice and mouth calibration test. How do I look?',
    { enabled: true, rate: 0.96, pitch: 1.15 });
});
ui('check-mya').addEventListener('click', async () => {
  ui('mya-diagnostics').textContent = 'Checking local services…';
  try {
    const status = await api.diagnostics();
    const model = status.canonicalModel
      ? 'Verified ' + (status.modelFormat || 'avatar') + ' (' + status.modelLocation + ')'
      : 'Missing / unverified';
    const kawaiiStatus = status.kawaiiClips + '/' + status.kawaiiExpected + ' files found';
    ui('mya-diagnostics').textContent =
      'Selected avatar: ' + model +
      '\nKawaii FBX: ' + kawaiiStatus +
      '\nOllama: ' + (status.ollama.reachable ? 'reachable' : 'offline') +
      '\nwhisper.cpp: ' + (status.whisper.reachable ? 'reachable' : 'offline') +
      '\nAnimation quality: NOT verified · Accurate lip sync: NOT verified';
  } catch (error) { ui('mya-diagnostics').textContent = 'Diagnostics failed: ' + error.message; }
});
ui('preview-wave').addEventListener('click', () => {
  if (!character) { toast('Import Mya\'s GLB or VRM first'); return; }
  if (!playMyaGesture('Wave')) toast('Avatar rig unavailable; import a humanoid GLB or VRM');
});
ui('minimize').addEventListener('click', async () => {
  speechSession.cancel();
  await mic.cancel();
  api.minimize();
});
ui('quit').addEventListener('click', async () => {
  speechSession.cancel();
  await mic.cancel();
  api.quit();
});
ui('click-through').addEventListener('click', async () => {
  const value = await api.toggleClickThrough();
  if (value) toast('Click-through enabled. Ctrl+Shift+M to interact again.');
});
ui('remember').addEventListener('click', async () => {
  const content = ui('memory-text').value.trim();
  if (!content) return;
  const record = { content, kind: ui('memory-kind').value };
  const result = editingMemoryId
    ? await api.updateMemory({ id: editingMemoryId, ...record })
    : await api.addMemory(record);
  if (!result.ok) { toast(result.error || 'Could not save memory'); return; }
  resetMemoryEditor();
  await updateMemories();
  toast('Saved as an explicitly approved memory.');
});
ui('cancel-memory-edit').addEventListener('click', resetMemoryEditor);
ui('export-memories').addEventListener('click', async () => {
  try {
    const result = await api.exportMemories();
    if (result.ok) toast('Memory export completed.');
    else if (!result.canceled) toast('Memory export was not completed.');
  } catch (error) { toast('Export failed: ' + error.message); }
});
ui('erase-memories').addEventListener('click', async () => {
  if (!confirm('Permanently erase all Mya memory notes?')) return;
  await api.clearMemories();
  resetMemoryEditor();
  await updateMemories();
  toast('Saved memories erased.');
});
api.onObservationStopped(() => {
  setWatching(false);
  ui('observation').textContent = 'Screen observation is disabled.';
});
ui('avatar-stage').addEventListener('wheel', event => {
  if (!character) return;
  event.preventDefault();
  const zoom = Math.sign(event.deltaY) * 0.14;
  camera.position.z = Math.max(modelCenter.z + 0.5, camera.position.z + zoom * viewportDistance);
}, { passive: false });
let pointerX = null;
ui('avatar-stage').addEventListener('pointerdown', event => { pointerX = event.clientX; });
ui('avatar-stage').addEventListener('pointermove', event => {
  if (pointerX === null || !character) return;
  const diff = event.clientX - pointerX;
  pointerX = event.clientX;
  characterYaw += diff * 0.013;
  character.rotation.y = characterYaw;
});
window.addEventListener('pointerup', () => { pointerX = null; });
window.addEventListener('beforeunload', () => { speechSession.cancel(); mic.cancel(); });
(async () => {
  try {
    await loadSettings();
    await loadModel();
    await updateMemories();
  } catch (error) { toast('Initialization error: ' + error.message); }
})();
