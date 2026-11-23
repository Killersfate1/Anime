'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const EventEmitter=require('node:events');
const {MyaNeuralVoice,VALID_VOICES}=require('./neural-voice.cjs');
class FakeWorker extends EventEmitter {
  constructor(){super();this.messages=[];this.terminated=false;}
  postMessage(message) {
    this.messages.push(message);
    queueMicrotask(()=>{
      if(message.type==='init') this.emit('message',{type:'ready',id:message.id});
      if(message.type==='speak') {
        const data=new Uint8Array(50);data.set([82,73,70,70],0);
        this.emit('message',{type:'audio',id:message.id,bytes:data});
      }
    });
  }
  async terminate(){this.terminated=true;this.emit('exit',0);}
}
function fresh(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mya-voice-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  return new MyaNeuralVoice({dataDir:dir,WorkerType:FakeWorker});
}
test('voice installation requires explicit user approval', async t=>{
  const voice=fresh(t);
  assert.equal(voice.status().installed,false);
  await assert.rejects(()=>voice.init({allowDownload:false}),/Install voice/i);
  const result=await voice.init({allowDownload:true});
  assert.equal(result.ready,true);
  assert.equal(result.installed,true);
  assert.equal(voice.worker.messages[0].allowDownload,true);
  voice.stop();
});
test('approved neural voice synthesizes only locally in its worker', async t=>{
  const voice=fresh(t);
  await voice.init({allowDownload:true});
  assert.ok(VALID_VOICES.has('af_bella'));
  const data=await voice.synthesize('Hello Mya!',{voice:'af_bella'});
  assert.equal(data.length,50);
  assert.equal(voice.worker.messages[1].voice,'af_bella');
  await assert.rejects(()=>voice.synthesize('hello',{voice:'unknown'}),/Unknown/);
  voice.stop();
});
test('previously installed voice initializes without internet permission', async t=>{
  const voice=fresh(t);await voice.init({allowDownload:true});voice.stop();
  const next=new MyaNeuralVoice({dataDir:voice.dataDir,WorkerType:FakeWorker});
  await next.init({allowDownload:false});
  assert.equal(next.worker.messages[0].allowDownload,false);
  next.stop();
});
test('stop is safe and releases all pending voice workers',async t=>{
  const voice=fresh(t); await voice.init({allowDownload:true});
  const worker=voice.worker;
  voice.stop();
  assert.equal(voice.status().ready,false);
  assert.equal(worker.terminated,true);
});
