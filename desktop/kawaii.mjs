import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Source Kawaii humanoid rig names were inspected in the FBX importer .meta.
// Target bone names were inspected in the original, user-provided Mya GLB.
// This bridge never creates or substitutes a character.
const BONE_NAMES = {
  pelvis: 'Hips', stomach: 'Spine', chest: 'Chest', neck: 'Neck', head: 'Head',
  'collar.l': 'Shoulder_L', 'collar.r': 'Shoulder_R',
  'upperarm.l': 'Upper Arm_L', 'upperarm.r': 'Upper Arm_R',
  'lowerarm.l': 'Lower Arm_L', 'lowerarm.r': 'Lower Arm_R',
  'palm.l': 'Hand_L', 'palm.r': 'Hand_R',
  'thigh.l': 'Upper Leg_L', 'thigh.r': 'Upper Leg_R',
  'lowerleg.l': 'Lower Leg_L', 'lowerleg.r': 'Lower Leg_R',
  'foot.l': 'Foot_L', 'foot.r': 'Foot_R',
  'toe.l': 'Toes_L', 'toe.r': 'Toes_R'
};
for (const side of ['l', 'r']) {
  const suffix = side.toUpperCase();
  BONE_NAMES['ta.' + side] = 'Thumb Proximal_' + suffix;
  BONE_NAMES['tb.' + side] = 'Thumb Intermediate_' + suffix;
  BONE_NAMES['tc.' + side] = 'Thumb Distal_' + suffix;
  for (const [number, finger] of [['1', 'Index'], ['2', 'Middle'], ['3', 'Ring'], ['4', 'Little']]) {
    BONE_NAMES['f' + number + 'a.' + side] = finger + ' Proximal_' + suffix;
    BONE_NAMES['f' + number + 'b.' + side] = finger + ' Intermediate_' + suffix;
    BONE_NAMES['f' + number + 'c.' + side] = finger + ' Distal_' + suffix;
  }
}
const normalize = name => String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
const keyOfTargetBone = name => name.toLowerCase().replace(/_\d+$/, '');
function getSkinnedMesh(object) {
  let found = null;
  object.traverse(node => { if (!found && node.isSkinnedMesh && node.skeleton) found = node; });
  return found;
}

export class MyaKawaiiAnimation {
  constructor(character) {
    this.character = character;
    this.skinnedMesh = getSkinnedMesh(character);
    this.mixer = new THREE.AnimationMixer(character);
    this.fbxLoader = new FBXLoader();
    this.actions = new Map();
    this.activeAction = null;
    this.state = null;
    this.failed = [];
    this.ready = false;
    this.mixer.addEventListener('finished', () => {
      if (this.state !== 'Idle' && this.state !== 'Talk') this.play('Idle');
    });
  }
  async loadAll(bridge, status = () => {}) {
    if (!this.skinnedMesh) {
      status('GLB has no usable skinned mesh; animations unavailable.');
      return false;
    }
    const available = await bridge.animationList();
    for (const state of available) {
      try {
        // Allow the viewport to draw between imported FBX clip parses.
        await new Promise(resolve => setTimeout(resolve, 0));
        const file = await bridge.readAnimation(state);
        if (!file || !file.base64) continue;
        const binary = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0)).buffer;
        const sourceRoot = this.fbxLoader.parse(binary, '');
        const sourceMesh = getSkinnedMesh(sourceRoot);
        let source = sourceMesh;
        if (!source) {
          const bones = [];
          sourceRoot.traverse(node => { if (node.isBone) bones.push(node); });
          if (!bones.length) throw new Error('FBX has no bones');
          sourceRoot.updateMatrixWorld(true);
          sourceRoot.skeleton = new THREE.Skeleton(bones);
          source = sourceRoot;
        }
        const sourceBones = source.skeleton.bones;
        const byNormalizedName = new Map(sourceBones.map(bone => [normalize(bone.name), bone.name]));
        const names = {};
        for (const targetBone of this.skinnedMesh.skeleton.bones) {
          const expected = BONE_NAMES[keyOfTargetBone(targetBone.name)];
          if (!expected) continue;
          const actual = byNormalizedName.get(normalize(expected));
          if (actual) names[targetBone.name] = actual;
        }
        if (Object.keys(names).length < 15) throw new Error('Less than 15 humanoid bones mapped; incompatible rig');
        const originalClip = sourceRoot.animations?.[0];
        if (!originalClip) throw new Error('FBX animation clip missing');
        const clip = SkeletonUtils.retargetClip(this.skinnedMesh, source, originalClip, {
          names,
          hip: names[this.skinnedMesh.skeleton.bones.find(b => keyOfTargetBone(b.name) === 'pelvis')?.name] || 'Hips',
          hipInfluence: new THREE.Vector3(0, 0, 0),
          useFirstFramePosition: false,
          fps: 24
        });
        if (!clip || !clip.tracks.length || !Number.isFinite(clip.duration) || clip.duration <= 0)
          throw new Error('Retarget yielded empty animation');
        clip.name = 'Mya_' + state;
        const action = this.mixer.clipAction(clip);
        action.setLoop(file.loop ? THREE.LoopRepeat : THREE.LoopOnce, file.loop ? Infinity : 1);
        action.clampWhenFinished = !file.loop;
        this.actions.set(state, action);
      } catch (error) {
        this.failed.push(state + ': ' + (error?.message || error));
      }
    }
    this.ready = this.actions.has('Idle');
    if (this.ready) this.play('Idle');
    status(this.ready
      ? 'Kawaii loaded: ' + this.actions.size + ' clips; verify pose quality in app'
      : 'Kawaii FBX retargeting needs manual adjustment');
    return this.ready;
  }
  play(state, transitionSeconds = 0.26) {
    const next = this.actions.get(state);
    if (!next || (this.activeAction === next && next.isRunning())) return false;
    const previous = this.activeAction;
    this.activeAction = next;
    this.state = state;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    if (previous && previous !== next) next.crossFadeFrom(previous, transitionSeconds, true);
    next.play();
    return true;
  }
  update(deltaSeconds) { if (this.ready) this.mixer.update(Math.min(deltaSeconds, 0.05)); }
  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.character);
    this.actions.clear();
    this.ready = false;
  }
}
