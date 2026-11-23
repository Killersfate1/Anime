'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
  fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events');
const {MyaLocalListening,MODEL}=require('./local-listening.cjs');
class FakeWorker extends EventEmitter {
  constructor(){super();this.messages=[];this.terminated=false;}
  postMessage(message){
    this.messages.push(message);
    queueMicrotask(()=>{
      if(message.type==='init')this.emit('message',{id:message.id,ok:true});
      if(message.type==='transcribe')this.emit('message',{id:message.id,ok:true,text:'Hello Mya!'});
    });
  }
  async terminate(){this.terminated=true;this.emit('exit',0);}
}
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mya-listening-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const stt=new MyaLocalListening({dataDir:dir,WorkerType:FakeWorker});
  t.after(()=>stt.close());
  return stt;
}
test('local speech-recognition model requires a first-run approval',async t=>{
  const stt=fixture(t);
  assert.equal((await stt.init({allowDownload:false})).ready,false);
  assert.equal(stt.worker,null);
  assert.equal((await stt.init({allowDownload:true})).ready,true);
  assert.equal(stt.worker.messages[0].allowDownload,true);
  assert.equal(stt.status().installed,true);
  assert.equal(stt.modelId,MODEL);
});
test('microphone transcription stays entirely in the local worker',async t=>{
  const stt=fixture(t);await stt.init({allowDownload:true});
  const answer=await stt.transcribe(new Uint8Array(48));
  assert.equal(answer,'Hello Mya!');
  assert.equal(stt.worker.messages[1].type,'transcribe');
  assert.equal(stt.worker.messages[1].wav.length,48);
});
test('previously cached model reopens without a new network permission',async t=>{
  const stt=fixture(t);await stt.init({allowDownload:true});
  stt.close();
  await stt.init({allowDownload:false});
  assert.equal(stt.ready,true);
  assert.equal(stt.worker.messages[0].allowDownload,false);
});
test('cancel terminates the worker and clears its active decoding state',async t=>{
  const stt=fixture(t);await stt.init({allowDownload:true});
  const worker=stt.worker;
  stt.cancel();
  assert.equal(stt.ready,false);
  assert.equal(worker.terminated,true);
});
