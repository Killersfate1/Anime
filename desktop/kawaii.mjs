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

const VRM_TO_FBX = {
  hips: 'Hips', spine: 'Spine', chest: 'Chest',
  neck: 'Neck', head: 'Head',
  leftShoulder: 'Shoulder_L', rightShoulder: 'Shoulder_R',
  leftUpperArm: 'Upper Arm_L', rightUpperArm: 'Upper Arm_R',
  leftLowerArm: 'Lower Arm_L', rightLowerArm: 'Lower Arm_R',
  leftHand: 'Hand_L', rightHand: 'Hand_R',
  leftUpperLeg: 'Upper Leg_L', rightUpperLeg: 'Upper Leg_R',
  leftLowerLeg: 'Lower Leg_L', rightLowerLeg: 'Lower Leg_R',
  leftFoot: 'Foot_L', rightFoot: 'Foot_R',
  leftToes: 'Toes_L', rightToes: 'Toes_R'
};
// Synty humanoid names verified against A_Walk_F_Femn.fbx.meta.
const SYNTY_NAMES = {
  Hips:'Hips', Spine:'Spine_01', Chest:'Spine_02', Neck:'Neck', Head:'Head',
  Shoulder_L:'Clavicle_L', Shoulder_R:'Clavicle_R',
  'Upper Arm_L':'Shoulder_L', 'Upper Arm_R':'Shoulder_R',
  'Lower Arm_L':'Elbow_L', 'Lower Arm_R':'Elbow_R',
  Hand_L:'Hand_L', Hand_R:'Hand_R', 'Upper Leg_L':'UpperLeg_L', 'Upper Leg_R':'UpperLeg_R',
  'Lower Leg_L':'LowerLeg_L', 'Lower Leg_R':'LowerLeg_R', Foot_L:'Ankle_L', Foot_R:'Ankle_R',
  Toes_L:'Ball_L', Toes_R:'Ball_R'
};
function getSkinnedMesh(object) {
  let found = null;
  object.traverse(node => { if (!found && node.isSkinnedMesh && node.skeleton) found = node; });
  return found;
}

export class MyaKawaiiAnimation {
  constructor(character, vrm = null) {
    this.character = character;
    this.vrm = vrm;
    this.skinnedMesh = getSkinnedMesh(character);
    this.mixer = new THREE.AnimationMixer(character);
    this.fbxLoader = new FBXLoader();
    this.actions = new Map();
    this.lastUsed = new Map();
    this.pending = new Map();
    this.queue = Promise.resolve();
    this.available = new Set();
    this.bridge = null;
    this.activeAction = null;
    this.state = null;
    this.wantedState = 'Idle';
    this.failed = [];
    this.failedStates = new Set();
    this.ready = false;
    this.disposed = false;
    this.maxCachedActions = 4;
    this.mixer.addEventListener('finished', event => {
      if (event.action === this.activeAction &&
          this.state !== 'Idle' && this.state !== 'Talk') this.play('Idle');
    });
  }

  // Compatibility with the old entrypoint: preload ONLY the idle action.
  // The other 11 clips are loaded one at a time when a gesture is requested.
  async loadAll(bridge, status = () => {}) {
    this.bridge = bridge;
    if (!this.skinnedMesh) {
      status('GLB contains no compatible skinned mesh');
      return false;
    }
    try {
      this.available = new Set(await bridge.animationList());
      if (this.disposed) return false;
      if (!this.available.has('Idle')) {
        status('Kawaii idle clip is missing. Character model is preserved.');
        return false;
      }
      const loaded = await this._ensure('Idle');
      if (this.disposed) return false;
      this.ready = !!loaded && this.actions.has('Idle');
      if (this.ready) this.play(this.wantedState || 'Idle');
      status(this.ready
        ? 'Kawaii idle ready; gestures load on demand'
        : 'Kawaii retargeting unavailable; model stays visible');
      return this.ready;
    } catch (error) {
      if (!this.disposed) {
        this.failed.push('Kawaii initialization: ' + (error.message || error));
        status('Kawaii load failed; avatar still available');
      }
      return false;
    }
  }

  _ensure(state) {
    if (this.disposed || !this.available.has(state) || this.failedStates.has(state)) return Promise.resolve(false);
    if (this.actions.has(state)) return Promise.resolve(true);
    if (this.pending.has(state)) return this.pending.get(state);

    // Serial parsing avoids several FBX copies and animation-retarget
    // allocations existing simultaneously in Chromium's JS heap.
    const job = this.queue.then(() => this._loadOne(state))
      .catch(error => {
        if (!this.disposed) {
          this.failedStates.add(state);
          this.failed.push(state + ': ' + (error?.message || error));
        }
        return false;
      })
      .finally(() => { this.pending.delete(state); });
    this.pending.set(state, job);
    this.queue = job.then(() => {});
    return job;
  }

  async _loadOne(state) {
    if (this.disposed) return false;
    const file = await this.bridge.readAnimation(state);
    if (this.disposed || !file || !file.bytes) return false;
    const view = file.bytes;
    const binary = view instanceof ArrayBuffer ? view :
      ArrayBuffer.isView(view)
        ? view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
        : null;
    if (!binary || binary.byteLength < 64 || binary.byteLength > 30 * 1024 * 1024)
      throw new Error('Invalid animation payload');
    const sourceRoot = this.fbxLoader.parse(binary, '');
    try {
      if (this.disposed) return false;
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

      const byName = new Map(source.skeleton.bones.map(b => [normalize(b.name), b.name]));
      // Kawaii FBXs may prefix humanoid bones with namespace or rig prefixes
      // (e.g. mixamorig:Hips). The old exact-only lookup missed valid rigs.
      const sourceBoneName = name => {
        const mapped = file.pack === 'synty' ? SYNTY_NAMES[name] : name;
        if (!mapped) return undefined;
        const normalized=normalize(mapped);
        return byName.get(normalized) ||
          [...byName.entries()].find(([key]) => key.endsWith(normalized))?.[1];
      };
      const names = {};
      if (this.vrm?.humanoid) {
        const skinnedBoneNames = new Set(this.skinnedMesh.skeleton.bones.map(b => b.name));
        for (const [humanBone, sourceName] of Object.entries(VRM_TO_FBX)) {
          const targetBone = this.vrm.humanoid.getRawBoneNode?.(humanBone);
          const sourceBone = sourceBoneName(sourceName);
          if (targetBone && skinnedBoneNames.has(targetBone.name) && sourceBone)
            names[targetBone.name] = sourceBone;
        }
      } else for (const bone of this.skinnedMesh.skeleton.bones) {
        const expected = BONE_NAMES[keyOfTargetBone(bone.name)];
        if (!expected) continue;
        const original = sourceBoneName(expected);
        if (original) names[bone.name] = original;
      }
      const mappedBones=Object.keys(names).length;
      if (mappedBones < (this.vrm ? 9 : 15))
        throw new Error('Insufficient humanoid bone mapping for Kawaii retarget (' +
          mappedBones + ' mapped). Check VRM humanoid bone assignments and FBX names.');

      const clip = sourceRoot.animations?.[0];
      if (!clip) throw new Error('No animation in source FBX');
      const pelvis = this.vrm?.humanoid?.getRawBoneNode?.('hips') ||
        this.skinnedMesh.skeleton.bones.find(b => keyOfTargetBone(b.name) === 'pelvis');
      // SkeletonUtils samples by mutating its target. Never use the visible
      // avatar as that target: lazy-loading an action would snap its pose.
      const clone = SkeletonUtils.clone(this.character);
      const target = getSkinnedMesh(clone);
      if (!target) throw Error('Cloned target has no skeleton');
      target.skeleton.pose();
      clone.updateMatrixWorld(true);
      const retargeted = SkeletonUtils.retargetClip(target, source, clip, {
        names,
        hip: pelvis ? names[pelvis.name] || 'Hips' : 'Hips',
        hipInfluence: new THREE.Vector3(0, 0, 0),
        useFirstFramePosition: false,
        fps: 24
      });
      if (!retargeted || !retargeted.tracks.length || !Number.isFinite(retargeted.duration) ||
          retargeted.duration <= 0) throw new Error('Retarget produced no usable tracks');

      // Bind by unique live bone UUID, not .bones[name] against the scene
      // root (which has no skeleton). Keep rest translation and scale intact.
      const live = new Map(this.skinnedMesh.skeleton.bones.map(b=>[b.name,b]));
      retargeted.tracks = retargeted.tracks.flatMap(track => {
        const match=/^\.bones\[([^\]]+)\]\.quaternion$/.exec(track.name);
        const bone=match ? live.get(match[1]) : null;
        if (!bone || !Array.from(track.values).every(Number.isFinite)) return [];
        track.name=bone.uuid+'.quaternion';
        return [track];
      });
      if (retargeted.tracks.length < 9) throw Error('Not enough bound quaternion tracks: '+retargeted.tracks.length);
      if (state === 'Walk') {
        for (const expected of ['leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg']) {
          const bone=this.vrm?.humanoid?.getRawBoneNode?.(expected);
          if (this.vrm && (!bone || !retargeted.tracks.some(track=>track.name===bone.uuid+'.quaternion')))
            throw Error('Walk missing leg mapping: '+expected);
        }
        const legTracks=retargeted.tracks.filter(track => {
          const b=[...live.values()].find(item=>track.name===item.uuid+'.quaternion');
          return b && /leg|thigh|ankle|foot/i.test(b.name);
        });
        if (!legTracks.some(track=> {
          const q=new THREE.Quaternion().fromArray(track.values);
          return Array.from(track.times).some((_,i)=>q.angleTo(new THREE.Quaternion().fromArray(track.values,i*4))>0.08);
        })) throw Error('Walk has no measured leg animation');
      }
      retargeted.name = 'Mya_' + state;
      if (this.disposed) return false;
      const action = this.mixer.clipAction(retargeted);
      action.setLoop(file.loop ? THREE.LoopRepeat : THREE.LoopOnce, file.loop ? Infinity : 1);
      action.clampWhenFinished = !file.loop;
      this.actions.set(state, action);
      this.lastUsed.set(state, Date.now());
      this._limitCache();
      return true;
    } finally {
      // Temporary FBX geometries/materials are not part of the saved GLB or
      // retargeted AnimationClip. Drop GPU resources after extracting tracks.
      sourceRoot.traverse(object => {
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
        for (const material of materials) material.dispose?.();
      });
    }
  }

  _limitCache() {
    while (this.actions.size > this.maxCachedActions) {
      const candidates = [...this.actions.keys()]
        .filter(state => state !== 'Idle' && state !== this.wantedState &&
          this.actions.get(state) !== this.activeAction)
        .sort((a,b) => (this.lastUsed.get(a) || 0) - (this.lastUsed.get(b) || 0));
      if (!candidates.length) break;
      const state = candidates[0];
      const action = this.actions.get(state);
      action.stop();
      this.mixer.uncacheClip(action.getClip());
      this.actions.delete(state);
      this.lastUsed.delete(state);
    }
  }

  prepare(state) { return this._ensure(state); }

  play(state, transitionSeconds = 0.26) {
    if (this.disposed || !this.available.has(state) || this.failedStates.has(state)) return false;
    this.wantedState = state;
    const next = this.actions.get(state);
    if (!next) {
      this._ensure(state).then(loaded => {
        if (loaded && !this.disposed && this.wantedState === state)
          this.play(state, transitionSeconds);
      });
      return true;
    }
    this.lastUsed.set(state, Date.now());
    if (this.activeAction === next && next.isRunning()) return true;
    const previous = this.activeAction;
    this.activeAction = next;
    this.state = state;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    if (previous && previous !== next) next.crossFadeFrom(previous, transitionSeconds, true);
    next.play();
    this._limitCache();
    return true;
  }

  update(deltaSeconds) {
    if (this.ready && !this.disposed)
      this.mixer.update(Math.min(deltaSeconds, 0.05));
  }
  dispose() {
    this.disposed = true;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.character);
    this.actions.clear();
    this.lastUsed.clear();
    this.available.clear();
    this.pending.clear();
    this.bridge = null;
    this.ready = false;
  }
}
