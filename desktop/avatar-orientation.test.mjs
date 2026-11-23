import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {autoUprightAvatar,assessAvatarUp,rotateAvatarManual} from './avatar-orientation.mjs';

function makeRig(rot=0){
  const root=new THREE.Group();
  const hips=new THREE.Bone();hips.name='Hips_01';hips.position.y=1;root.add(hips);
  const head=new THREE.Bone();head.name='Head_01';head.position.y=1;hips.add(head);
  root.rotation.z=rot;root.updateWorldMatrix(true,true);
  return {root,hips,head};
}
test('does not rotate an already upright humanoid GLB',()=>{
  const {root}=makeRig(0);
  const q=root.quaternion.clone();
  assert.equal(autoUprightAvatar(root).corrected,false);
  assert.ok(root.quaternion.equals(q));
});
test('repairs an upside-down rig without changing bones or mesh',()=>{
  const {root,hips,head}=makeRig(Math.PI);
  const beforeHips=hips.position.clone(),beforeHead=head.position.clone();
  assert.equal(assessAvatarUp(root).upsideDown,true);
  const result=autoUprightAvatar(root);
  assert.equal(result.corrected,true);
  assert.ok(assessAvatarUp(root).dot>0.99);
  assert.ok(hips.position.equals(beforeHips)&&head.position.equals(beforeHead));
});
test('repairs a sideways import but preserves the source hierarchy',()=>{
  const {root,head}=makeRig(Math.PI/2);
  assert.equal(autoUprightAvatar(root).corrected,true);
  assert.equal(root.children[0].children[0],head);
  assert.ok(assessAvatarUp(root).dot>0.99);
});
test('manual 180 flip can be undone without accumulating drift',()=>{
  const {root}=makeRig(0);
  const original=root.quaternion.clone();
  rotateAvatarManual(root,original,true);
  assert.ok(assessAvatarUp(root).dot<0);
  rotateAvatarManual(root,original,false);
  assert.ok(assessAvatarUp(root).dot>0.99);
  assert.ok(original.angleTo(root.quaternion)<0.0001);
});
test('keeps rig unchanged when target head or hips are unavailable',()=>{
  const scene=new THREE.Group();
  const before=scene.quaternion.clone();
  const result=autoUprightAvatar(scene);
  assert.equal(result.corrected,false);
  assert.ok(before.equals(scene.quaternion));
});
