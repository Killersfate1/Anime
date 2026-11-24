'use strict';
// A native ONNX crash cannot kill Electron or Mya's local GGUF engine.
const {EventEmitter}=require('node:events');
const {fork}=require('node:child_process');
const path=require('node:path');
class ModelProcessWorker extends EventEmitter {
  constructor(filename,{workerData={}}={}) {
    super();
    const script=path.resolve(filename);
    if(!script.startsWith(__dirname+path.sep)||!script.endsWith('-worker.mjs'))
      throw Error('Invalid local model worker entrypoint');
    this.stderr='';
    this.child=fork(path.join(__dirname,'model-process-host.cjs'),
      [script,JSON.stringify(workerData)],{
        execPath:process.execPath,execArgv:[],
        env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},
        serialization:'advanced',
        stdio:['ignore','ignore','pipe','ipc'],windowsHide:true
      });
    this.child.stderr?.on('data',data=>{
      this.stderr=(this.stderr+String(data)).slice(-1200);
    });
    this.child.on('message',message=>this.emit('message',message));
    this.child.on('error',error=>this.emit('error',error));
    this.child.on('exit',(code,signal)=>{
      if(code!==0&&this.stderr)
        this.emit('error',Error('Isolated model worker crashed: '+this.stderr.slice(-650)));
      this.emit('exit',code??-1,signal);
    });
  }
  postMessage(message){
    if(!this.child.connected)throw Error('Offline model subprocess is disconnected');
    this.child.send(message,error=>{if(error)this.emit('error',error);});
  }
  terminate(){
    if(!this.child.killed)this.child.kill();
    return Promise.resolve(0);
  }
}
module.exports={ModelProcessWorker};
