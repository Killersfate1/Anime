import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ui = (id) => document.getElementById(id);
const api = window.mya;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 1000);
const renderer = new THREE.WebGLRenderer({
  canvas: ui('avatar-canvas'), alpha: true, antialias: true, powerPreference: 'low-power'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
scene.add(new THREE.HemisphereLight(0xffe5fa, 0x55416e, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(2.0, 4.5, 3.5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xc289ee, 1.25);
fillLight.position.set(-3.5, 1.4, -3.0);
scene.add(fillLight);

let character = null;
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
  if (character) scene.remove(character);
  character = gltf.scene;
  scene.add(character);
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
  characterYaw = 0;
  moveToRest();
  ui('avatar-empty').classList.add('hidden');
  ui('avatar-status').textContent = head ? 'Mya · GLB skeleton' : 'Mya · GLB loaded (rig check required)';
}
async function loadModel() {
  try {
    const data = await api.loadModel();
    if (!data) {
      ui('avatar-empty').classList.remove('hidden');
      ui('avatar-status').textContent = 'Import original GLB';
      return;
    }
    const decoded = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
    loader.parse(decoded.buffer, '', applyAvatar, error => toast('GLB load failed: ' + error.message));
  } catch (error) { toast('GLB read failed: ' + error.message); }
}
function frame(t) {
  animationFrame = requestAnimationFrame(frame);
  const interval = currentSettings.economyMode ? 1000 / 30 : 1000 / 60;
  if (t - lastFrameAt < interval) return;
  lastFrameAt = t;
  const elapsed = clock.getElapsedTime();
  if (head && baseHead) {
    const amount = speaking ? 0.38 : 1;
    const nod = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      Math.sin(elapsed * (speaking ? 3.1 : 0.7)) * 0.024 * amount,
      Math.sin(elapsed * 0.37) * 0.037 * amount,
      Math.sin(elapsed * 0.53) * 0.012 * amount
    ));
    head.quaternion.copy(baseHead).multiply(nod);
  }
  if (chest && baseChest) {
    const breathe = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      Math.sin(elapsed * 1.6) * 0.007, 0, 0
    ));
    chest.quaternion.copy(baseChest).multiply(breathe);
  }
  eyeBones.forEach((eye, i) => {
    if (!baseEyes[i]) return;
    const glance = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      Math.sin(elapsed * 0.24) * 0.024,
      Math.sin(elapsed * 0.34) * 0.022, 0
    ));
    eye.quaternion.copy(baseEyes[i]).multiply(glance);
  });
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
  if (!currentSettings.voiceEnabled || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 500));
  utterance.rate = 1.03;
  utterance.pitch = 1.15;
  utterance.onstart = () => { speaking = true; ui('state').textContent = 'Speaking'; };
  const reset = () => { speaking = false; ui('state').textContent = 'Ready'; };
  utterance.onend = reset;
  utterance.onerror = reset;
  speechSynthesis.speak(utterance);
}
async function sendMessage() {
  const input = ui('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  message(text, 'user');
  ui('state').textContent = 'Thinking';
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
      say(result.proposedComment);
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
}
async function saveSettings() {
  try {
    currentSettings = await api.updateSettings({
      chatModel: ui('chat-model').value,
      visionModel: ui('vision-model').value,
      talkativeness: Number(ui('talkativeness').value),
      voiceEnabled: ui('voice-enabled').checked,
      economyMode: ui('economy-mode').checked,
      quietMode: ui('quiet-mode').checked
    });
    if (currentSettings.quietMode) setWatching(false);
    await loadSettings();
    toast('Settings saved.');
  } catch (error) { toast('Settings error: ' + error.message); }
}
async function updateMemories() {
  const memories = await api.getMemories();
  ui('memory-count').textContent = memories.length + ' user-approved memories saved';
}
async function importModel() {
  try {
    const info = await api.importModel();
    if (info) { await loadModel(); toast('Original GLB imported locally. SHA-256: ' + info.sha256.slice(0, 12)); }
  } catch (error) { toast(error.message); }
}
for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => showTab(button.dataset.tab));
ui('send').addEventListener('click', sendMessage);
ui('chat-input').addEventListener('keydown', event => { if (event.key === 'Enter') sendMessage(); });
ui('import-model').addEventListener('click', importModel);
ui('change-avatar').addEventListener('click', importModel);
ui('avatar-recenter').addEventListener('click', () => { characterYaw = 0; moveToRest(); });
ui('refresh-sources').addEventListener('click', refreshSources);
ui('start-watch').addEventListener('click', startWatching);
ui('stop-watch').addEventListener('click', stopWatching);
ui('save-settings').addEventListener('click', saveSettings);
ui('minimize').addEventListener('click', () => api.minimize());
ui('quit').addEventListener('click', () => api.quit());
ui('click-through').addEventListener('click', async () => {
  const value = await api.toggleClickThrough();
  if (value) toast('Click-through enabled. Ctrl+Shift+M to interact again.');
});
ui('remember').addEventListener('click', async () => {
  const text = ui('memory-text').value.trim();
  if (!text) return;
  await api.addMemory(text);
  ui('memory-text').value = '';
  await updateMemories();
  toast('Saved only because you explicitly chose Remember.');
});
ui('erase-memories').addEventListener('click', async () => {
  if (!confirm('Permanently erase all Mya memory notes?')) return;
  await api.clearMemories();
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
(async () => {
  try {
    await loadSettings();
    await loadModel();
    await updateMemories();
  } catch (error) { toast('Initialization error: ' + error.message); }
})();
