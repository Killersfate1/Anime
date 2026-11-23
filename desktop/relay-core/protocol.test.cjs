'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateEnvelope,RelayLocalInterface,VERSION}=require('./protocol.cjs');
test('local protocol rejects unversioned, malformed and overlarge commands',()=>{
  assert.throws(()=>validateEnvelope({type:'memory.list',id:'x',payload:{}}),/version/);
  assert.throws(()=>validateEnvelope({version:VERSION,type:'memory.upload_to_cloud',id:'x',payload:{}}),/Unknown/);
  assert.throws(()=>validateEnvelope({version:VERSION,type:'memory.list',id:'../',payload:{}}),/ID/);
  assert.throws(()=>validateEnvelope({version:VERSION,type:'memory.list',id:'x',payload:{data:'x'.repeat(13000)}}),/limit/);
});
test('avatar events and memory requests use separate versioned contracts',()=>{
  assert.equal(validateEnvelope({version:VERSION,type:'avatar.talk.start',id:'ok',payload:{}},{event:true}).type,'avatar.talk.start');
  assert.throws(()=>validateEnvelope({version:VERSION,type:'avatar.talk.start',id:'ok',payload:{}}),/Unknown/);
});
test('relay bridge dispatches strictly allowlisted local memory calls',async()=>{
  const db={facts:()=>[{content:'reviewed'}],reset:()=>{},approve:id=>({ok:true,id})};
  const manager={prepare:async text=>({question:text}),finish:async()=>({saved:true}),startConversation:()=>{}};
  const retriever={retrieve:async q=>[{text:q}]};
  const bridge=new RelayLocalInterface({manager,repository:db,retriever});
  const query={version:VERSION,id:'test_1',type:'memory.list',payload:{}};
  assert.equal((await bridge.dispatch(query))[0].content,'reviewed');
  assert.equal((await bridge.dispatch({...query,type:'memory.approve',payload:{id:'x'}})).ok,true);
});
