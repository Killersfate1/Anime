import * as THREE from 'three';

// Fix coordinate-space errors only at the avatar scene root. Never modify
// skeleton rest transforms, meshes, animation curves, VRM bone maps or textures.
const PATTERNS = {
  head: [/^head(?:[_.\-\d]|$)/i,/^j_bip_c_head$/i],
  hips: [/^(?:hips?|pelvis|root_hips?|j_bip_c_hips)(?:[_.\-\d]|$)/i],
  chest: [/^(?:chest|upperchest|spine(?:[_.\-\d]|$)|j_bip_c_chest)(?:[_.\-\d]|$)/i]
};
function findBone(root,pattern) {
  let target=null;
  root.traverse(node=>{
    if(target||!node.isBone)return;
    if(pattern.some(re=>re.test(node.name)))target=node;
  });
  return target;
}
function humanoidBone(vrm,name) {
  try { return vrm?.humanoid?.getRawBoneNode?.(name) || null; }
  catch { return null; }
}
export function assessAvatarUp(root,vrm=null) {
  root.updateWorldMatrix(true,true);
  const head=humanoidBone(vrm,'head')||findBone(root,PATTERNS.head);
  const pelvis=humanoidBone(vrm,'hips')||findBone(root,PATTERNS.hips)||
    humanoidBone(vrm,'chest')||findBone(root,PATTERNS.chest);
  if(!head||!pelvis||head===pelvis)
    return {available:false,upsideDown:false,dot:1,reason:'head/hips contact points unavailable'};
  const up=head.getWorldPosition(new THREE.Vector3())
    .sub(pelvis.getWorldPosition(new THREE.Vector3()));
  if(up.lengthSq()<0.00001)
    return {available:false,upsideDown:false,dot:1,reason:'head/hips separation too small'};
  up.normalize();
  const dot=up.dot(new THREE.Vector3(0,1,0));
  return {available:true,upsideDown:dot<0,dot,direction:up};
}
export function autoUprightAvatar(root,vrm=null) {
  const measured=assessAvatarUp(root,vrm);
  // Correct inverted or severely sideways imports without touching VRM
  // internals. Upright rigs remain exactly unchanged.
  if(!measured.available || measured.dot>=0.55)
    return {corrected:false,...measured};
  const correction=new THREE.Quaternion().setFromUnitVectors(
    measured.direction,new THREE.Vector3(0,1,0));
  root.quaternion.premultiply(correction);
  root.updateWorldMatrix(true,true);
  return {corrected:true,beforeDot:measured.dot,...assessAvatarUp(root,vrm)};
}
export function rotateAvatarManual(root,baseQuaternion,flipped=false,yaw=0) {
  const yawQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);
  const flipQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI);
  root.quaternion.copy(baseQuaternion);
  if(flipped)root.quaternion.premultiply(flipQ);
  root.quaternion.premultiply(yawQ);
  root.updateWorldMatrix(true,true);
}
