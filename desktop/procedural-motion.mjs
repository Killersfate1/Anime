import * as THREE from 'three';

// A tiny local animation safety net. It never replaces Mya or writes into
// imported avatar files. This runs only if Kawaii retargeting is unavailable.
// Binds to standardized VRM humanoid bones or the uploaded GLB's readable rig.
function boneFrom(root, vrm, humanName, patterns) {
  const mapped = vrm?.humanoid?.getRawBoneNode?.(humanName);
  if (mapped) return mapped;
  let found = null;
  root.traverse(node => {
    if (!found && node.isBone && patterns.some(regex => regex.test(node.name))) found = node;
  });
  return found;
}
const BONE_RULES = {
  hips: [/^(pelvis|hips?)(_|$)/i],
  spine: [/^(stomach|spine)(_|$)/i],
  chest: [/^(chest|upperchest)(_|$)/i],
  head: [/^head(_|$)/i],
  leftUpperArm: [/^(upperarm\.l|leftupperarm|upperarm_l)(_|$)/i],
  rightUpperArm: [/^(upperarm\.r|rightupperarm|upperarm_r)(_|$)/i],
  leftLowerArm: [/^(lowerarm\.l|leftlowerarm|lowerarm_l)(_|$)/i],
  rightLowerArm: [/^(lowerarm\.r|rightlowerarm|lowerarm_r)(_|$)/i]
};
export class MyaProceduralMotion {
  constructor(root, vrm = null) {
    this.root = root;
    this.bones = {};
    this.original = {};
    for (const [name, patterns] of Object.entries(BONE_RULES)) {
      const bone = boneFrom(root, vrm, name, patterns);
      if (bone) {
        this.bones[name] = bone;
        this.original[name] = bone.quaternion.clone();
      }
    }
    this.time = 0;
    this.state = 'Idle';
    this.gestureStarted = 0;
    this.lastIdleChoice = 0;
    this.idleStyle = 'Idle';
    this.blend = 0;
    this.disposed = false;
  }
  get status() {
    return {
      bound: Object.keys(this.bones),
      animated: !!(this.bones.leftUpperArm || this.bones.rightUpperArm || this.bones.chest),
      state: this.state
    };
  }
  play(state) {
    if (this.disposed) return false;
    const allowed = ['Idle','Waiting','Think','LookAround','Stretch','Wave','Talk','Cheer','Surprised','Concerned','Shy','Laugh'];
    if (!allowed.includes(state)) return false;
    this.state = state;
    this.gestureStarted = this.time;
    return true;
  }
  update(delta) {
    if (this.disposed) return;
    const dt = THREE.MathUtils.clamp(delta || 0.016, 0.001, 0.05);
    this.time += dt;
    const t = this.time;
    const actionT = t - this.gestureStarted;
    if (this.state !== 'Idle' && this.state !== 'Talk' && this.state !== 'Waiting' &&
        actionT > 2.2) this.play('Idle');

    // The rig's imported rest pose is preserved. Small additive rotations
    // produce visible motion without changing skeletal proportions.
    const idle = Math.sin(t * 1.65);
    const slow = Math.sin(t * 0.62);
    let chest = 0.022 * idle, headX = 0.035 * slow, headY = 0.048 * Math.sin(t * 0.33);
    let leftArmZ = 0.032 * idle, rightArmZ = -0.032 * idle;
    let leftArmX = 0, rightArmX = 0, leftElbowX = 0, rightElbowX = 0;
    const burst = Math.sin(Math.min(1, actionT / 0.34) * Math.PI / 2);
    switch (this.state) {
      case 'Talk':
        chest += Math.sin(t * 3.8) * 0.014;
        leftArmX = Math.sin(t * 2.0) * 0.025;
        rightArmX = Math.sin(t * 2.6 + 1) * 0.028;
        headX += Math.sin(t * 2.2) * 0.018;
        break;
      case 'Wave':
        // Conservative shoulder and elbow gestures only; avoid extreme IK.
        rightArmZ = -0.42 * burst;
        rightArmX = -0.18 * burst;
        rightElbowX = -0.42 * burst + Math.sin(t * 7) * 0.12;
        break;
      case 'Cheer':
        leftArmZ = 0.33 * burst;
        rightArmZ = -0.33 * burst;
        leftArmX = -0.15 * burst;
        rightArmX = -0.15 * burst;
        headX -= 0.08 * burst;
        break;
      case 'Think':
        headX += 0.08 * burst;
        headY += 0.13 * burst;
        break;
      case 'LookAround':
        headY += 0.15 * Math.sin(actionT * 2.2);
        break;
      case 'Shy':
        headX += 0.10 * burst;
        headY -= 0.05 * burst;
        break;
      case 'Surprised':
        headX -= 0.09 * burst;
        leftArmZ += 0.1 * burst;
        rightArmZ -= 0.1 * burst;
        break;
      case 'Laugh':
        chest += 0.035 * Math.sin(t * 7) * burst;
        headX += 0.04 * burst;
        break;
      case 'Concerned':
        headX += 0.07 * burst;
        break;
      case 'Stretch':
        leftArmZ += 0.17 * burst;
        rightArmZ -= 0.17 * burst;
        break;
    }
    const values = {
      chest: [chest, 0, 0],
      spine: [chest * 0.4, 0, 0],
      head: [headX, headY, 0],
      leftUpperArm: [leftArmX, 0, leftArmZ],
      rightUpperArm: [rightArmX, 0, rightArmZ],
      leftLowerArm: [leftElbowX, 0, 0],
      rightLowerArm: [rightElbowX, 0, 0]
    };
    for (const [name, [x, y, z]] of Object.entries(values)) {
      const bone = this.bones[name];
      if (!bone) continue;
      const additional = new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z));
      const destination = this.original[name].clone().multiply(additional);
      bone.quaternion.slerp(destination, 1 - Math.exp(-10 * dt));
    }
  }
  dispose() {
    for (const [name, bone] of Object.entries(this.bones))
      bone.quaternion.copy(this.original[name]);
    this.disposed = true;
  }
}
