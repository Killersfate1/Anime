'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const {ModelProcessWorker}=require('./model-process-worker.cjs');
test('model subprocess preserves local IPC without booting ONNX',async()=>{
  const worker=new ModelProcessWorker(path.join(__dirname,'local-listening-worker.mjs'),
    {workerData:{cacheDir:path.join(__dirname,'runtime','test-cache')}});
  try {
    const reply=await new Promise((resolve,reject)=>{
      const t=setTimeout(()=>reject(Error('Subprocess IPC timeout')),7000);
      worker.once('message',value=>{clearTimeout(t);resolve(value);});
      worker.once('error',error=>{clearTimeout(t);reject(error);});
      worker.postMessage({id:17,type:'unexpected-command'});
    });
    assert.equal(reply.id,17);
    assert.equal(reply.ok,false);
    assert.match(reply.error,/Unknown voice command/);
  } finally {await worker.terminate();}
});
