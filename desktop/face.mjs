import * as THREE from 'three';

// An adapter for Mya's *existing* face. It never modifies the uploaded GLB.
// 1) Prefer supported morphs or jaw bones.
// 2) If the GLB has neither, allow a manually positioned mouth overlay.
// The overlay is OFF by default; its position must be calibrated on Mya.
const CHANNELS = {
  mouthOpen: /^(jawopen|mouthopen|visemeaa|visemea|aa|a|moutha)$/i,
  mouthRound: /^(mouthfunnel|mouthpucker|visemeoh|visemeou|visemeo|oh|ou)$/i,
  mouthWide: /^(mouthstretch|visemeee|visemeih|ee|ih)$/i,
  blinkLeft: /^(eyeblinkleft|blinkleft|blink_l|blinkl)$/i,
  blinkRight: /^(eyeblinkright|blinkright|blink_r|blinkr)$/i,
  smile: /^(mouthsmile|smile|happy|joy)$/i
};
const normalize = value => String(value).replace(/[^a-z0-9]/gi, '').toLowerCase();

export function findFaceChannels(avatar) {
  const found = {};
  const morphs = [];
  let jaw = null, head = null;
  avatar?.traverse?.(node => {
    const name = normalize(node.name);
    if (!head && node.isBone && /^head\d*$/.test(name)) head = node;
    if (!jaw && node.isBone && /^(jaw|chin|lowerjaw)\d*$/.test(name)) jaw = node;
    const dict = node.morphTargetDictionary;
    if (!dict || !Array.isArray(node.morphTargetInfluences)) return;
    for (const [label,index] of Object.entries(dict)) {
      const channel = Object.entries(CHANNELS).find(([, regex]) => regex.test(normalize(label)))?.[0];
      if (channel && Number.isInteger(index) && index >= 0 && index < node.morphTargetInfluences.length) {
        morphs.push({ channel, mesh: node, index, baseline: node.morphTargetInfluences[index] || 0 });
        found[channel] = (found[channel] || 0) + 1;
      }
    }
  });
  return { jaw, head, morphs, channels: found };
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
const BASE_OPTIONS = {
  enabled: false, x: 0, y: -0.10, z: 0.10, width: 0.035, height: 0.010, faceBack: false
};
export class MyaFace {
  constructor(avatar, options = {}) {
    this.avatar = avatar;
    this.rig = findFaceChannels(avatar);
    this.fallback = null;
    this.options = { ...BASE_OPTIONS };
    this.talking = false;
    this.viseme = 'rest';
    this.mouth = 0;
    this.target = 0;
    this.emotion = 'neutral';
    this.jawStart = this.rig.jaw?.quaternion.clone() || null;
    this.setFallback(options);
    this._buildFallback();
  }
  getDiagnostics() {
    return {
      morphChannels: { ...this.rig.channels },
      hasJaw: !!this.rig.jaw,
      hasHead: !!this.rig.head,
      fallbackAvailable: !!this.rig.head,
      fallbackEnabled: !!this.fallback?.visible,
      accurateLipSync: false // system TTS has no waveform/phoneme timings
    };
  }
  setFallback(options = {}) {
    const accepted = {};
    if (typeof options.enabled === 'boolean') accepted.enabled = options.enabled;
    if (typeof options.faceBack === 'boolean') accepted.faceBack = options.faceBack;
    for (const [key, min, max] of [
      ['x', -0.35, 0.35], ['y', -0.40, 0.25], ['z', -0.45, 0.45],
      ['width', 0.005, 0.10], ['height', 0.002, 0.06]
    ]) if (Number.isFinite(options[key])) accepted[key] = clamp(options[key], min, max);
    Object.assign(this.options, accepted);
    if (this.fallback) this._positionFallback();
  }
  _buildFallback() {
    if (!this.rig.head) return;
    const group = new THREE.Group();
    group.name = 'MyaCalibratedMouthOverlay';
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24),
      new THREE.MeshBasicMaterial({ color: 0x321321, side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthWrite: false })
    );
    const lip = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1.04, 24),
      new THREE.MeshBasicMaterial({ color: 0xe987b0, side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthWrite: false })
    );
    inner.renderOrder = 8;
    lip.renderOrder = 9;
    group.add(inner, lip);
    this.rig.head.add(group);
    this.fallback = group;
    this._positionFallback();
  }
  _positionFallback() {
    if (!this.fallback) return;
    this.fallback.visible = this.options.enabled;
    this.fallback.position.set(this.options.x, this.options.y, this.options.z);
    this.fallback.rotation.y = this.options.faceBack ? Math.PI : 0;
  }
  setTalking(value) {
    this.talking = !!value;
    if (!this.talking) { this.viseme = 'rest'; this.target = 0; }
  }
  setEmotion(emotion) {
    this.emotion = /^(happy|curious|surprised|concerned|playful|shy)$/.test(emotion) ? emotion : 'neutral';
  }
  setViseme(viseme, strength = 0.6) {
    if (!this.talking) return;
    this.viseme = /^(rest|open|wide|round|closed)$/.test(viseme) ? viseme : 'open';
    this.target = this.viseme === 'rest' || this.viseme === 'closed'
      ? 0.02 : clamp(strength, 0.05, 1);
  }
  update(deltaSeconds) {
    const dt = clamp(Number(deltaSeconds) || 0.016, 0.001, 0.1);
    const wanted = this.talking ? Math.max(0.12, this.target) : 0;
    this.mouth = THREE.MathUtils.damp(this.mouth, wanted, this.talking ? 15 : 12, dt);
    this.target = Math.max(0, this.target - 2.8 * dt);
    const mouth = this.mouth;
    const morphValue = {
      mouthOpen: mouth,
      mouthRound: this.viseme === 'round' ? mouth * 0.8 : 0,
      mouthWide: this.viseme === 'wide' ? mouth * 0.8 : 0,
      smile: this.emotion === 'happy' || this.emotion === 'playful' ? 0.45 : 0,
      blinkLeft: 0,
      blinkRight: 0
    };
    for (const entry of this.rig.morphs) {
      const target = Math.max(entry.baseline, morphValue[entry.channel] || 0);
      const current = entry.mesh.morphTargetInfluences[entry.index];
      entry.mesh.morphTargetInfluences[entry.index] = THREE.MathUtils.damp(current, target, 12, dt);
    }
    if (this.rig.jaw && this.jawStart) {
      const jaw = new THREE.Quaternion().setFromEuler(new THREE.Euler(mouth * 0.17, 0, 0));
      this.rig.jaw.quaternion.copy(this.jawStart).multiply(jaw);
    }
    if (this.fallback) {
      const w = this.options.width * (this.viseme === 'round' ? 0.72 : this.viseme === 'wide' ? 1.20 : 1);
      const h = this.options.height * (0.20 + mouth * 2.9);
      this.fallback.scale.set(w, Math.max(0.001, h), 1);
    }
  }
  dispose() {
    for (const entry of this.rig.morphs)
      entry.mesh.morphTargetInfluences[entry.index] = entry.baseline;
    if (this.rig.jaw && this.jawStart) this.rig.jaw.quaternion.copy(this.jawStart);
    if (this.fallback) {
      this.rig.head?.remove(this.fallback);
      this.fallback.traverse(obj => {
        obj.geometry?.dispose?.();
        obj.material?.dispose?.();
      });
      this.fallback = null;
    }
  }
}
