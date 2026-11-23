import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { MyaKawaiiAnimation } from './kawaii.mjs';
import { MyaProceduralMotion } from './procedural-motion.mjs';
import { MyaPushToTalk } from './voice.mjs';
import { SpeechSync, speechEmotion } from './speech-sync.mjs';
import { MyaVoicePlayer } from './neural-voice-playback.mjs';
import { autoUprightAvatar, rotateAvatarManual } from './avatar-orientation.mjs';
import { MyaFace } from './face.mjs';

const ui = (id) => document.getElementById(id);
const api = window.mya;
const mic = new MyaPushToTalk(
  api,
  (status) => {
    const labels = {
      idle: 'Microphone OFF · Click 🎙 to speak when local listening is ready',
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
    ui('mic-status').textContent = 'Heard: ' + transcript.slice(0, 110) + ' · sending to Mya…';
    ui('chat-input').value = transcript;
    await sendMessage();
    ui('mic-status').textContent = 'Microphone OFF · Transcript sent to Chat';
  },
  error => {
    const detail = 'Microphone/recognition: ' + (error?.message || String(error));
    toast(detail);
    // The push-to-talk controller reports idle in its cleanup path. Keep
    // the actual failure visible after that status update, not just in a
    // four-second toast.
    queueMicrotask(() => { ui('mic-status').textContent = detail; });
  }
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
let avatarBaseQuaternion = new THREE.Quaternion();
let manualAvatarFlip = false;
let avatarOrientationStatus = '';
let kawaii = null;
let procedural = null;
let preferProcedural = false;
let movementCheck = null;
const compatibilityMaterials = new Map();
let compatibilityMode = false;
function setTextureCompatibility(enabled) {
  if (!character) return false;
  if (!enabled) {
    for (const [mesh, item] of compatibilityMaterials) {
      mesh.material = item.original;
      for (const material of item.generated) material.dispose();
    }
    compatibilityMaterials.clear();
    compatibilityMode = false;
    ui('texture-compat').textContent = 'Try texture compatibility mode';
    return true;
  }
  let replaced = 0;
  character.traverse(mesh => {
    if (!mesh.isMesh) return;
    const original = mesh.material;
    const materials = Array.isArray(original) ? original : [original];
    const generated = [];
    const replacements = materials.map(material => {
      // Reuse the original character's decoded color texture, never a
      // generated substitute. MToon uses shadeMultiplyTexture in some versions.
      const texture = material?.map || material?.baseColorTexture ||
        material?.shadeMultiplyTexture;
      if (!texture?.isTexture) return material;
      const simple = new THREE.MeshBasicMaterial({
        name: 'MyaTextureCompatibility',
        map: texture,
        color: 0xffffff,
        transparent: !!material.transparent,
        opacity: typeof material.opacity === 'number' ? material.opacity : 1,
        alphaTest: material.alphaTest || 0,
        side: material.side ?? THREE.FrontSide,
        depthWrite: material.depthWrite !== false,
        toneMapped: false
      });
      generated.push(simple);
      replaced++;
      return simple;
    });
    if (generated.length) {
      compatibilityMaterials.set(mesh, { original, generated });
      mesh.material = Array.isArray(original) ? replacements : replacements[0];
    }
  });
  if (!replaced) {
    ui('material-diagnostics').textContent +=
      ' · No decoded texture maps available for compatibility mode';
    compatibilityMode = false;
    return false;
  }
  compatibilityMode = true;
  ui('texture-compat').textContent = 'Restore original shaders';
  ui('material-diagnostics').textContent +=
    ' · Basic textured fallback ACTIVE for ' + replaced + ' materials (temporary)';
  return true;
}
function inspectAvatarMaterials(gltf) {
  const materials = new Set();
  let meshes = 0, textured = 0, whiteMaterials = 0;
  gltf.scene.traverse(obj => {
    if (!obj.isMesh) return;
    meshes++;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      if (!mat || materials.has(mat)) continue;
      materials.add(mat);
      if (mat.map || mat.shadeMultiplyTexture || mat.emissiveMap) textured++;
      if (mat.color?.r > 0.95 && mat.color.g > 0.95 && mat.color.b > 0.95) whiteMaterials++;
    }
  });
  const images = gltf.parser?.json?.images?.length ?? 'unknown';
  const maps = gltf.parser?.json?.textures?.length ?? 'unknown';
  ui('material-diagnostics').textContent =
    'Meshes: ' + meshes + ' · Materials: ' + materials.size +
    ' · Material texture maps: ' + textured +
    ' · Embedded images: ' + images + ' · glTF textures: ' + maps +
    (textured === 0 && images !== 0 && images !== 'unknown'
      ? ' · WARNING: images exist but no active texture maps were detected'
      : '');
}
function reportMotionStatus() {
  const fallback = procedural?.status;
  ui('animation-diagnostics').textContent =
    'Kawaii: ' + (kawaii?.ready ? 'loaded' : 'not ready') +
    ' · Backup motion: ' + (fallback?.animated ? 'available' : 'no compatible bones') +
    ' · Active: ' + (preferProcedural || !kawaii?.ready ? 'backup' : 'Kawaii') +
    (kawaii?.failed?.length ? ' · Retarget warnings: ' + kawaii.failed.slice(-2).join(' / ') : '');
}
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
// Mya animates the original (raw) humanoid skeleton with Kawaii FBX and
// procedural gestures. three-vrm normally copies normalized rest poses onto
// raw bones on vrm.update(), undoing that animation and leaving an A-pose.
// Disable that copy while retaining VRM expressions, physics and constraints.
loader.register(parser => new VRMLoaderPlugin(parser, { autoUpdateHumanBones: false }));
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
const neuralVoicePlayer = new MyaVoicePlayer(api, {
  onStart: () => speechSession.onStart({emotion: speechEmotion(neuralVoicePlayer.spokenText), text:neuralVoicePlayer.spokenText}),
  onEnd: () => speechSession.onEnd(),
  onError: error => {
    ui('neural-voice-status').textContent = 'Neural voice playback failed: ' + error;
    toast('Neural voice: ' + error);
  },
  onLevel: level => face?.setViseme('open', level)
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
  return item;
}
function moveToRest() {
  if (!character) return;
  rotateAvatarManual(character,avatarBaseQuaternion,manualAvatarFlip,characterYaw);
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
  if (compatibilityMode) setTextureCompatibility(false);
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
  scene.add(character);
  const orientation = autoUprightAvatar(character,activeVRM);
  avatarOrientationStatus=orientation.corrected
    ? 'Auto-corrected imported avatar orientation'
    : orientation.available?'Upright humanoid pose detected':'Orientation not measurable · use Flip 180° if needed';
  manualAvatarFlip=false;
  avatarBaseQuaternion.copy(character.quaternion);
  vrmBaseYaw = 0;
  face = new MyaFace(character, faceSettings(), activeVRM);
  faceDiagnostics();
  inspectAvatarMaterials(gltf);
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
  ui('avatar-flip').title = avatarOrientationStatus + ' · Flip 180° manually';
  ui('avatar-empty').classList.add('hidden');
  ui('avatar-status').textContent = activeVRM
    ? 'Mya · VRM ' + (activeVRM.meta?.metaVersion || '') + ' · Kawaii loading…'
    : head ? 'Mya · GLB · Kawaii loading…' : 'Mya · GLB loaded (rig check required)';
  procedural = new MyaProceduralMotion(character, activeVRM);
  movementCheck = null;
  kawaii = new MyaKawaiiAnimation(character, activeVRM);
  reportMotionStatus();
  nextIdleMoment = performance.now() + 12000;
  const loadingController = kawaii;
  kawaii.loadAll(api, text => {
    if (kawaii === loadingController) ui('avatar-status').textContent = text;
  }).then(ok => {
    if (kawaii !== loadingController) return;
    reportMotionStatus();
    if (ok && procedural?.status.animated) {
      const joints = Object.values(procedural.bones || {});
      movementCheck = {
        began: performance.now(),
        joints,
        initial: joints.map(bone => bone.quaternion.clone()),
        maxAngle: 0
      };
    }
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
  } catch (error) { toast('Avatar read failed: ' + error.message); }
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
  if (useKawaii) {
    kawaii.update(delta);
    if (movementCheck) {
      let moved = 0;
      movementCheck.joints.forEach((bone, index) => {
        moved = Math.max(moved, bone.quaternion.angleTo(movementCheck.initial[index]));
      });
      movementCheck.maxAngle = Math.max(movementCheck.maxAngle, moved);
      if (t - movementCheck.began > 5000) {
        if (movementCheck.maxAngle < 0.005) {
          preferProcedural = true;
          ui('force-procedural').checked = true;
          kawaii.mixer.stopAllAction();
          procedural?.play('Idle');
          ui('avatar-status').textContent = 'Mya moving with fallback · Kawaii retarget did not animate bones';
          reportMotionStatus();
        }
        movementCheck = null;
      }
    }
  } else procedural?.update(delta);
  if (!speaking && t > nextIdleMoment) {
    const choices = ['Idle', 'Idle', 'LookAround', 'Waiting', 'Stretch'];
    playMyaGesture(choices[Math.floor(Math.random() * choices.length)]);
    nextIdleMoment = t + 14000 + Math.random() * 14000;
  }
  // The fallback maintains coherent idle motion when Kawaii retarget is
  // missing. Do not apply separate GLB bone oscillations on top of it.
  neuralVoicePlayer.update();
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

async function say(text) {
  neuralVoicePlayer.cancel();
  speechSession.cancel();
  if (!currentSettings.voiceEnabled || currentSettings.quietMode) return;
  if (currentSettings.voiceMode !== 'system') {
    const status = await api.neuralVoiceStatus();
    if (status.ready) {
      neuralVoicePlayer.spokenText = text;
      neuralVoicePlayer.speak(text);
      return;
    }
    toast('Neural voice is not ready. Install voice in Settings; Windows voice used temporarily.');
  }
  if (!speechSession.speak(text, { enabled:true })) {
    speaking = false;
    face?.setTalking(false);
    playMyaGesture('Idle');
  }
}
function showResearch(result) {
  const holder = ui('research-output');
  holder.replaceChildren();
  holder.classList.add('hidden');
  if (!result) return;
  if (!result.searched) {
    if (result.reason) {
      const info = document.createElement('p');
      info.textContent = 'Search was not completed: ' + result.reason;
      holder.append(info);
      holder.classList.remove('hidden');
    }
    return;
  }
  const title = document.createElement('strong');
  title.textContent = 'Mya searched ' + result.provider + ': ' + result.query;
  holder.append(title);
  for (const [index, source] of (result.sources || []).entries()) {
    const item = document.createElement('button');
    item.className = 'research-source';
    item.textContent = '[' + (index + 1) + '] ' + source.title;
    item.title = source.url;
    item.addEventListener('click', async () => {
      const opened = await api.openResearchSource(source.url);
      if (!opened?.ok) toast('Could not open this source');
    });
    holder.append(item);
  }
  if (!result.sources?.length) {
    const none = document.createElement('p');
    none.textContent = 'No reliable results returned from this search provider.';
    holder.append(none);
  }
  holder.classList.remove('hidden');
}
let activeChatRequest = null;
let chatSerial = 0;
api.onChatDelta(payload => {
  if (!activeChatRequest || payload?.requestId !== activeChatRequest.id ||
      typeof payload.delta !== 'string') return;
  const item = activeChatRequest.bubble;
  item.textContent = (item.textContent === '…' ? '' : item.textContent) + payload.delta;
  ui('conversation').scrollTop = ui('conversation').scrollHeight;
});
async function sendMessage() {
  if (activeChatRequest) return;
  const input = ui('chat-input');
  const text = input.value.trim();
  if (!text) return;
  const requestId = 'mya-' + ++chatSerial;
  input.value = '';
  message(text, 'user');
  showResearch(null);
  const bubble = message('…');
  activeChatRequest = { id: requestId, bubble };
  ui('state').textContent = currentSettings.webEnabled ? 'Thinking · research allowed' : 'Thinking';
  playMyaGesture('Think');
  ui('send').disabled = true;
  ui('stop-answer').disabled = false;
  try {
    const result = await api.askLocalAI(text, requestId);
    if (result.canceled) {
      bubble.textContent = bubble.textContent === '…' ? 'Response stopped.' :
        bubble.textContent + ' (stopped)';
    } else if (result.error) {
      toast(result.error);
      bubble.textContent = result.error;
      if (result.error.includes('brain') || result.error.includes('model')) {
        showTab('settings');
        await refreshEngineStatus();
      }
    } else {
      bubble.textContent = result.text;
      showResearch(result.research);
      say(result.text);
      updateMemories().catch(()=>{});
    }
  } catch(error) {
    bubble.textContent = 'Mya AI error: ' + error.message;
    toast(error.message);
  } finally {
    if (activeChatRequest?.id === requestId) activeChatRequest = null;
    ui('send').disabled = false;
    ui('stop-answer').disabled = true;
    if (!speaking) ui('state').textContent = 'Ready';
  }
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
  ui('talkativeness').value = currentSettings.talkativeness;
  ui('voice-enabled').checked = currentSettings.voiceEnabled;
  ui('voice-mode').value = currentSettings.voiceMode || 'neural';
  ui('voice-name').value = currentSettings.voiceName || 'af_heart';
  ui('voice-speed').value = currentSettings.voiceSpeed || 1;
  ui('economy-mode').checked = currentSettings.economyMode;
  ui('quiet-mode').checked = currentSettings.quietMode;
  ui('personality-mode').value = currentSettings.personalityMode || 'girlfriend';
  ui('affection').value = currentSettings.affection ?? 0.95;
  ui('flirtation').value = currentSettings.flirtation ?? 0.95;
  ui('mature-banter').checked = currentSettings.matureBanter !== false;
  ui('web-enabled').checked = !!currentSettings.webEnabled;
  ui('auto-research').checked = currentSettings.autoResearch !== false;
  ui('memory-suggestions').checked = currentSettings.memorySuggestions !== false;
  ui('episodic-recording').checked = currentSettings.episodicRecording !== false;
  ui('web-provider').value = currentSettings.webProvider || 'wikipedia';
  ui('web-key-status').textContent = currentSettings.webKeyPresent ? 'API key saved locally' : 'No key saved';
  ui('force-procedural').checked = preferProcedural;
  reportMotionStatus();
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
      talkativeness: Number(ui('talkativeness').value),
      voiceEnabled: ui('voice-enabled').checked,
      voiceMode: ui('voice-mode').value,
      voiceName: ui('voice-name').value,
      voiceSpeed: Number(ui('voice-speed').value),
      economyMode: ui('economy-mode').checked,
      quietMode: ui('quiet-mode').checked,
      personalityMode: ui('personality-mode').value,
      affection: Number(ui('affection').value),
      flirtation: Number(ui('flirtation').value),
      matureBanter: ui('mature-banter').checked,
      webEnabled: ui('web-enabled').checked,
      webProvider: ui('web-provider').value,
      autoResearch: ui('auto-research').checked,
      memorySuggestions: ui('memory-suggestions').checked,
      episodicRecording: ui('episodic-recording').checked,
      webApiKey: ui('web-api-key').value.trim(),
      mouthEnabled: ui('mouth-enabled').checked,
      mouthFaceBack: ui('mouth-face-back').checked,
      mouthX: Number(ui('mouth-x').value),
      mouthY: Number(ui('mouth-y').value),
      mouthZ: Number(ui('mouth-z').value),
      mouthWidth: Number(ui('mouth-width').value),
      mouthHeight: Number(ui('mouth-height').value)
    });
    if (currentSettings.quietMode) setWatching(false);
    ui('web-api-key').value = '';
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
  await updateMemoryDetails();
}
async function updateMemoryDetails() {
  try {
    const [pending, episodes, conversations, relationship, embeddings] = await Promise.all([
      api.pendingMemories(), api.episodicMemories(), api.localConversations(),
      api.relationshipHistory(), api.embeddingStatus()
    ]);
    ui('memory-pending-count').textContent = pending.length
      ? pending.length + ' facts awaiting your approval (not yet used by Mya)'
      : 'No pending fact suggestions.';
    ui('memory-embeddings-status').textContent=embeddings.ready
      ? 'Offline semantic embeddings ready'
      : embeddings.installed ? 'Model installed; not currently loaded' :
        'Keyword search active; semantic model not installed';
    ui('memory-embeddings-install').disabled=embeddings.ready;
    const pendingList=ui('memory-pending');pendingList.replaceChildren();
    for(const entry of pending.slice(0,80)){
      const row=document.createElement('div');row.className='memory-entry';
      const body=document.createElement('div');body.className='memory-entry-body';
      const kind=document.createElement('span');kind.className='memory-entry-kind';
      kind.textContent=(entry.kind||'fact')+(entry.conflictWith?' · conflicts with an existing fact':'')+
        (entry.sensitivity==='sensitive'?' · private detail':'');
      const content=document.createElement('span');content.textContent=entry.content;
      body.append(kind,content);
      const approve=document.createElement('button');approve.textContent='Remember';
      approve.addEventListener('click',async()=>{
        if(entry.conflictWith && !confirm('This replaces a previously approved fact. Confirm the correction?'))return;
        const result=await api.approveMemory(entry.id);
        if(!result.ok){toast(result.error||'Could not approve memory');return;}
        await updateMemories();
      });
      const reject=document.createElement('button');reject.textContent='Forget';
      reject.addEventListener('click',async()=>{await api.rejectMemory(entry.id);await updateMemories();});
      row.append(body,approve,reject);pendingList.append(row);
    }
    const epi=ui('memory-episodes');epi.replaceChildren();
    for(const entry of episodes.slice(0,30)){
      const row=document.createElement('div');row.className='memory-entry';
      const body=document.createElement('div');body.className='memory-entry-body';
      const date=document.createElement('span');date.className='memory-entry-kind';
      date.textContent=entry.event_at.slice(0,10)+' · '+entry.title;
      const summary=document.createElement('span');summary.textContent=entry.summary;
      body.append(date,summary);
      const remove=document.createElement('button');remove.textContent='Delete';
      remove.addEventListener('click',async()=>{await api.deleteEpisode(entry.id);await updateMemories();});
      row.append(body,remove);epi.append(row);
    }
    const conv=ui('memory-conversations');conv.replaceChildren();
    for(const entry of conversations.slice(0,35)){
      const row=document.createElement('div');row.className='memory-entry';
      const body=document.createElement('div');body.className='memory-entry-body';
      const label=document.createElement('span');label.textContent=
        'Conversation · '+entry.started_at.slice(0,16).replace('T',' ');
      body.append(label);
      const expand=document.createElement('button');expand.textContent='Inspect';
      expand.addEventListener('click',async()=>{
        const messages=await api.readConversation(entry.id);
        body.replaceChildren(label);
        for(const message of messages){
          const text=document.createElement('span');
          text.textContent=message.role+': '+message.content;
          body.append(text);
        }
      });
      const remove=document.createElement('button');remove.textContent='Delete';
      remove.addEventListener('click',async()=>{
        if(!confirm('Delete this saved conversation?'))return;
        await api.deleteConversation(entry.id);await updateMemories();
      });
      row.append(body,expand,remove);conv.append(row);
    }
    ui('memory-relationship').textContent='Interactions: '+relationship.interaction_count+
      ' · Shared experiences: '+relationship.shared_experience_count+
      ' · Familiarity score: '+Math.round(relationship.familiarity*100)+'%'+
      ' (conversation history only; not human emotions)';
  } catch(error){toast('Memory inspection failed: '+error.message);}
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
  try {
    if (mic.state === 'recording') { await mic.stop(); return; }
    if (mic.state !== 'idle') { await mic.cancel(); return; }
    const status = await api.listeningStatus();
    if (!status?.ready) {
      const detail = status?.error || 'Local listening has not finished loading. Check Settings → Let Mya hear you.';
      ui('mic-status').textContent = 'Microphone unavailable · ' + detail;
      showTab('settings');
      toast(detail);
      return;
    }
    // Interrupt playback so Mya does not record her own speech.
    neuralVoicePlayer.cancel();
    speechSession.cancel();
    playMyaGesture('Idle');
    await mic.start();
  } catch (error) {
    const detail = 'Microphone startup failed: ' + (error?.message || String(error));
    ui('mic-status').textContent = detail;
    toast(detail);
  }
});
ui('chat-input').addEventListener('keydown', event => { if (event.key === 'Enter') sendMessage(); });
ui('import-model').addEventListener('click', importModel);
ui('change-avatar').addEventListener('click', importModel);
ui('avatar-recenter').addEventListener('click', () => {
  characterYaw = 0;
  manualAvatarFlip = false;
  moveToRest();
});
ui('avatar-flip').addEventListener('click', () => {
  if(!character)return;
  manualAvatarFlip = !manualAvatarFlip;
  moveToRest();
  ui('avatar-status').textContent = (manualAvatarFlip ? 'Manual 180° rotation active' : avatarOrientationStatus) +
    ' · Original avatar and animations preserved';
});
ui('refresh-sources').addEventListener('click', refreshSources);
ui('start-watch').addEventListener('click', startWatching);
ui('stop-watch').addEventListener('click', stopWatching);
ui('save-settings').addEventListener('click', saveSettings);
function showNeuralVoiceStatus(status) {
  ui('neural-voice-status').textContent = status.ready
    ? 'Neural voice ready · beautiful offline speech enabled'
    : status.state === 'installing' || status.state === 'loading'
      ? (status.message || 'Preparing Mya voice…')
      : status.lastError
        ? 'Voice error: ' + status.lastError
        : status.installed ? 'Voice installed · loading…' : 'Neural voice not installed yet';
  ui('install-voice').disabled = status.ready || status.state === 'installing' || status.state === 'loading';
  // A missing Kokoro model must not disable testing the built-in Windows
  // speech fallback. Both paths are testable without a chat response.
  ui('preview-neural-voice').disabled = false;
  ui('preview-neural-voice').textContent = status.ready ? 'Hear Mya\'s voice' : 'Test Windows voice';
}
async function refreshNeuralVoice() {
  try { showNeuralVoiceStatus(await api.neuralVoiceStatus()); }
  catch(error) { ui('neural-voice-status').textContent = 'Voice status error: ' + error.message; }
}
async function refreshListeningStatus() {
  try {
    const state=await api.listeningStatus();
    ui('listening-status').textContent=state.ready?'Ready · local-only listening':
      state.installed?'Installed · loading model…':
      state.error?'Listening error: '+state.error:'Not installed';
    ui('install-listening').disabled=state.ready;
    if(state.ready && mic.state==='idle')
      ui('mic-status').textContent='Microphone OFF · Click 🎙 to talk to Mya';
  } catch(error) {
    ui('listening-status').textContent='Listening status error: '+error.message;
  }
}
ui('install-listening').addEventListener('click',async()=>{
  if(!confirm('Install Mya’s local Whisper Tiny speech recognition model? This downloads Apache-2.0 model files once, then your recorded microphone audio stays on this computer.'))return;
  ui('install-listening').disabled=true;
  ui('listening-status').textContent='Installing Whisper locally…';
  try{
    const state=await api.installListening();
    if(!state.ready)toast('Listening setup: '+(state.error||'model not ready'));
    else toast('Mya can hear your microphone now! ♡');
  }catch(error){toast('Listening setup: '+error.message);}
  await refreshListeningStatus();
});
ui('install-voice').addEventListener('click', async () => {
  ui('install-voice').disabled = true;
  ui('neural-voice-status').textContent = 'Downloading Mya voice assets locally. First install requires internet…';
  const poll = setInterval(refreshNeuralVoice, 1200);
  try {
    const result = await api.installNeuralVoice();
    showNeuralVoiceStatus(result);
    if (result.ready) toast('Mya has her neural voice! ♡');
    else toast('Voice installation failed: ' + (result.error || result.lastError || 'unknown'));
  } catch(error) { toast('Voice installation failed: ' + error.message); }
  finally { clearInterval(poll); await refreshNeuralVoice(); }
});
ui('preview-neural-voice').addEventListener('click', async () => {
  try {
    await saveSettings();
    if (!currentSettings.voiceEnabled) {
      const detail = 'Enable “Speak Mya’s replies aloud” to test the voice.';
      ui('neural-voice-status').textContent = detail;
      toast(detail);
      return;
    }
    if (currentSettings.quietMode) {
      const detail = 'Quiet mode is on. Turn it off to test the voice.';
      ui('neural-voice-status').textContent = detail;
      toast(detail);
      return;
    }
    const neuralReady = currentSettings.voiceMode !== 'system' && (await api.neuralVoiceStatus()).ready;
    ui('neural-voice-status').textContent = neuralReady
      ? 'Testing Kokoro voice output…'
      : 'Testing Windows speech fallback (Kokoro not selected or not ready)…';
    await say('Hey! It’s Mya. How does my voice sound? I’m excited to talk with you!');
  } catch (error) {
    const detail = 'Voice preview failed: ' + (error?.message || String(error));
    ui('neural-voice-status').textContent = detail;
    toast(detail);
  }
});
ui('stop-neural-voice').addEventListener('click', () => {
  neuralVoicePlayer.cancel(); speechSession.cancel();
});
function renderEngineStatus(info) {
  if (!info) return;
  let status, detail;
  if (info.ready) {
    status = 'Mya is awake ♡';
    detail = 'Her local intelligence is running privately on this computer.';
  } else if (info.state === 'starting') {
    status = 'Mya is waking up…';
    detail = 'Loading her local memory and language model.';
  } else if (!info.engineSelected || !info.modelSelected) {
    status = 'Mya’s brain has not been installed in this development copy.';
    detail = 'A complete Mya build needs its own licensed language model and inference files. No external AI account or connection is required.';
  } else {
    status = 'Mya’s brain couldn’t start.';
    detail = info.lastError || 'The local model could not initialize. Check the application logs.';
  }
  ui('engine-status').textContent = status + '\n' + detail;
  ui('local-ai-status').textContent = status;
  ui('open-brain-setup').classList.toggle('hidden',info.ready||info.state==='starting');
  ui('brain-install-controls').classList.toggle('hidden',info.ready);
  if(!info.ready && info.state!=='starting')ui('state').textContent='Brain not ready';
  else if(info.ready && !activeChatRequest)ui('state').textContent='Ready to talk';
}
async function refreshEngineStatus() {
  try { renderEngineStatus(await api.engineStatus()); }
  catch (error) { ui('engine-status').textContent = 'Mya’s brain status is unavailable: ' + error.message; }
}
function showBrainProgress(progress) {
  if(!progress)return;
  const percent=progress.total>0 ? ' · '+Math.floor(progress.current/progress.total*100)+'%' : '';
  ui('brain-download-progress').textContent=(progress.message||'')+percent;
  ui('install-brain').disabled=!!progress.busy || progress.stage==='ready';
  ui('cancel-brain-install').disabled=!progress.busy;
  if(progress.stage==='ready'){
    ui('brain-download-progress').textContent='Mya is ready for private offline conversations. ♡';
    refreshEngineStatus();
  }
  if(progress.stage==='error'){
    toast('Mya installation: '+progress.message);
    ui('install-brain').disabled=false;
  }
}
api.onBrainInstallProgress(showBrainProgress);
ui('open-brain-setup').addEventListener('click',()=>showTab('settings'));
ui('install-brain').addEventListener('click',async()=>{
  const tier=ui('brain-model-tier').value==='lite'?'lite':'standard';
  const size=tier==='lite'?'1.28 GB':'2.5 GB';
  if(!confirm('Install Mya’s private local '+(tier==='lite'?'Lite':'Standard')+' AI? This downloads approximately '+size+' of Apache-2.0 Qwen model weights and an MIT-licensed llama.cpp Windows CPU engine from their official hosts. Both downloads are verified by SHA-256. After installation, inference stays on your computer. Allow this download?'))return;
  ui('install-brain').disabled=true;
  ui('cancel-brain-install').disabled=false;
  ui('brain-download-progress').textContent='Preparing Mya’s local brain download…';
  try{
    const result=await api.installBrain(tier);
    if(!result.ok)toast('Brain installation failed: '+result.error);
    else toast('Mya is ready to have conversations! ♡');
  }catch(error){toast('Brain installation error: '+error.message);}
  finally{
    await refreshEngineStatus();
    showBrainProgress(await api.brainInstallStatus());
  }
});
ui('cancel-brain-install').addEventListener('click',async()=>{
  await api.cancelBrainInstall();
  ui('brain-download-progress').textContent='Canceling installation…';
});
ui('stop-answer').addEventListener('click', () => api.cancelLocalChat());
ui('clear-web-key').addEventListener('click', async () => {
  await api.updateSettings({clearWebKey: true});
  ui('web-api-key').value = '';
  await loadSettings();
  toast('Saved search key cleared');
});
ui('texture-compat').addEventListener('click', () => {
  const next = !compatibilityMode;
  if (!setTextureCompatibility(next)) toast('No usable material textures found; check avatar diagnostics.');
  else toast(next ? 'Using existing color textures with simpler shaders.' : 'Original VRM/GLB shaders restored.');
});
ui('force-procedural').addEventListener('change', () => {
  preferProcedural = ui('force-procedural').checked;
  movementCheck = null;
  if (preferProcedural) {
    kawaii?.mixer?.stopAllAction();
    procedural?.play('Idle');
  } else playMyaGesture('Idle');
  reportMotionStatus();
});
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
  say('Hey! I am Mya! This is my voice and mouth calibration test. How do I look?');
});
ui('check-mya').addEventListener('click', async () => {
  ui('mya-diagnostics').textContent = 'Checking Mya…';
  try {
    const status = await api.diagnostics();
    const model = status.canonicalModel
      ? 'Verified ' + (status.modelFormat || 'avatar') + ' (' + status.modelLocation + ')'
      : 'Missing / unverified';
    const kawaiiStatus = status.kawaiiClips + '/' + status.kawaiiExpected + ' files found';
    ui('mya-diagnostics').textContent =
      'Selected avatar: ' + model +
      '\nKawaii FBX: ' + kawaiiStatus +
      '\nMya’s mind: ' + (status.localAI.ready ? 'ready' : status.localAI.state) +
      '\nVoice input: ' + (status.whisper.ready ? 'available locally' : 'needs installation') +
      '\nAnimation quality: NOT verified · Accurate lip sync: NOT verified';
  } catch (error) { ui('mya-diagnostics').textContent = 'Diagnostics failed: ' + error.message; }
});
ui('preview-wave').addEventListener('click', () => {
  if (!character) { toast('Import Mya\'s GLB or VRM first'); return; }
  if (!playMyaGesture('Wave')) toast('Avatar rig unavailable; import a humanoid GLB or VRM');
});
ui('minimize').addEventListener('click', async () => {
  neuralVoicePlayer.cancel();
  speechSession.cancel();
  await mic.cancel();
  api.minimize();
});
ui('quit').addEventListener('click', async () => {
  neuralVoicePlayer.cancel();
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
ui('memory-embeddings-install').addEventListener('click',async()=>{
  if(!confirm('Install an Apache-2.0 offline embedding model for improved private memory recall? One-time download required.'))return;
  ui('memory-embeddings-status').textContent='Installing neural memory embeddings locally…';
  ui('memory-embeddings-install').disabled=true;
  try{
    const state=await api.installEmbeddings();
    if(!state.ready)toast(state.error||'Semantic model installation was not completed');
  }catch(error){toast('Could not install semantic model: '+error.message);}
  await updateMemoryDetails();
});
ui('reset-personal-memory').addEventListener('click',async()=>{
  if(!confirm('Delete ALL saved conversations, episodes, approved facts, pending memories and relationship history?'))return;
  if(!confirm('This cannot be undone. Permanently reset all Relay personal memory?'))return;
  const response=await api.resetAllPersonalMemory();
  if(!response.ok){toast('Could not reset memory');return;}
  ui('conversation').replaceChildren();
  message('Memory reset. This is a new conversation. ♡');
  resetMemoryEditor();
  await updateMemories();
  toast('All Relay personal memory erased.');
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
  rotateAvatarManual(character,avatarBaseQuaternion,manualAvatarFlip,characterYaw);
});
window.addEventListener('pointerup', () => { pointerX = null; });
window.addEventListener('beforeunload', () => { neuralVoicePlayer.dispose(); speechSession.cancel(); mic.cancel(); });
(async () => {
  try {
    await loadSettings();
    await refreshNeuralVoice();
    await refreshListeningStatus();
    await refreshEngineStatus();
    showBrainProgress(await api.brainInstallStatus());
    setInterval(refreshEngineStatus, 2200);
    await loadModel();
    await updateMemories();
  } catch (error) { toast('Initialization error: ' + error.message); }
})();
