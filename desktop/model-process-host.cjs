'use strict';
// Dedicated Node process hosts one ONNX worker. If a native addon aborts,
// the OS terminates this child process rather than the Electron main process.
const {Worker}=require('node:worker_threads');
const path=require('node:path');
const script=path.resolve(process.argv[2]||'');
if(!script.startsWith(__dirname+path.sep)||!script.endsWith('-worker.mjs'))
  process.exit(1);
let workerData;
try {workerData=JSON.parse(process.argv[3]||'{}');}
catch {process.stderr.write('Invalid model worker settings\n');process.exit(1);}
const worker=new Worker(script,{workerData});
worker.on('message',data=>{if(process.connected)process.send(data);});
worker.on('error',error=>{
  process.stderr.write('Model worker failed: '+String(error?.stack||error)+'\n');
  process.exit(1);
});
worker.on('exit',code=>process.exit(code===0?0:1));
process.on('message',data=>worker.postMessage(data));
process.on('disconnect',()=>worker.terminate().finally(()=>process.exit(0)));
