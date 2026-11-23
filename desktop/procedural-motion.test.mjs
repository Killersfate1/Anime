import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MyaProceduralMotion } from './procedural-motion.mjs';

function testRig() {
  const root = new THREE.Group();
  for (const name of ['Head_01','Chest_01','upperarm.l_02','upperarm.r_02','lowerarm.l_02','lowerarm.r_02']) {
    const bone = new THREE.Bone();
    bone.name = name;
    root.add(bone);
  }
  return root;
}
test('moves canonical GLB humanoid bones without replacing character geometry', () => {
  const avatar = testRig();
  const motion = new MyaProceduralMotion(avatar);
  assert.equal(motion.status.animated,true);
  const chest = avatar.getObjectByName('Chest_01');
  motion.update(0.04);
  assert.notDeepEqual(chest.quaternion.toArray(), [0,0,0,1]);
  const originalCount = avatar.children.length;
  motion.play('Wave');
  for(let i=0;i<20;i++) motion.update(0.04);
  assert.equal(avatar.children.length,originalCount);
  assert.notDeepEqual(avatar.getObjectByName('upperarm.r_02').quaternion.toArray(),[0,0,0,1]);
  motion.dispose();
  assert.deepEqual(chest.quaternion.toArray(),[0,0,0,1]);
});
test('works without FBX clips using standardized VRM humanoid mapping', () => {
  const avatar = new THREE.Group();
  const head = new THREE.Bone();
  head.name = 'nonstandard-vrm-head';
  avatar.add(head);
  const fakeVRM = {humanoid:{getRawBoneNode:(name)=>name==='head'?head:null}};
  const motion = new MyaProceduralMotion(avatar,fakeVRM);
  assert.ok(motion.status.bound.includes('head'));
  assert.equal(motion.play('Think'),true);
  motion.update(0.05);
  assert.notDeepEqual(head.quaternion.toArray(),[0,0,0,1]);
});
