'use strict';
// Own Whisper model inside a worker; no whisper.cpp server, speech API,
// remote audio upload, or microphone background access.
const fs=require('node:fs'),path=require('node:path');
const {ModelProcessWorker:Worker}=require('./model-process-worker.cjs');
const MODEL='onnx-community/whisper-tiny.en';
class MyaLocalListening{
  constructor({dataDir,WorkerType=Worker}={}){
    if(!dataDir)throw Error('Mya listening requires a local data directory');
    Object.assign(this,{dataDir,WorkerType,modelId:MODEL});
    this.worker=null;this.ready=false;this.loading=null;
    this.pending=new Map();this.nextId=0;this.error='';
    this.marker=path.join(dataDir,'listening-installed.json');
  }
  installed(){
    try{return JSON.parse(fs.readFileSync(this.marker,'utf8'))?.model===MODEL;}
    catch{return false;}
  }
  status(){return {ready:this.ready,installed:this.installed(),error:this.error,model:this.modelId};}
  startWorker(){
    if(this.worker)return;
    const worker=new this.WorkerType(path.join(__dirname,'local-listening-worker.mjs'),{
      workerData:{cacheDir:path.join(this.dataDir,'cache')}
    });
    this.worker=worker;
    worker.on('message',result=>{
      const job=this.pending.get(result.id);if(!job)return;
      this.pending.delete(result.id);clearTimeout(job.timer);
      if(result.ok)job.resolve(result);
      else job.reject(Error(result.error||'Local listening failed'));
    });
    const fail=error=>{
      if(this.worker!==worker)return;
      this.worker=null;this.ready=false;this.error=String(error?.message||error);
      for(const job of this.pending.values()){
        clearTimeout(job.timer);job.reject(Error(this.error));
      }
      this.pending.clear();
    };
    worker.on('error',fail);
    worker.on('exit',code=>fail(Error('Local listening worker stopped ('+code+')')));
  }
  request(type,params={},timeout=150000){
    this.startWorker();
    const id=++this.nextId;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        this.pending.delete(id);reject(Error('Local speech recognition timed out'));
      },timeout);
      this.pending.set(id,{timer,resolve,reject});
      try{this.worker.postMessage({id,type,...params});}
      catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
    });
  }
  async init({allowDownload=false}={}){
    if(this.ready)return this.status();
    if(!allowDownload&&!this.installed())return this.status();
    if(this.loading)return this.loading;
    this.loading=this.request('init',{allowDownload},300000).then(()=>{
      this.ready=true;this.error='';
      fs.mkdirSync(this.dataDir,{recursive:true,mode:0o700});
      fs.writeFileSync(this.marker,JSON.stringify({model:MODEL,installedAt:new Date().toISOString()}),{mode:0o600});
      return this.status();
    }).catch(error=>{this.ready=false;this.error=error.message;return this.status();})
      .finally(()=>this.loading=null);
    return this.loading;
  }
  async transcribe(bytes){
    if(!this.ready)throw Error('Mya listening model is not installed');
    const wav=bytes instanceof Uint8Array?bytes:Buffer.from(bytes);
    if(wav.length<48||wav.length>550000)throw Error('Invalid local recording');
    const result=await this.request('transcribe',{wav},180000);
    return String(result.text||'').trim();
  }
  cancel(){
    // Termination interrupts an in-flight ONNX decode and avoids ghost
    // transcriptions being delivered after the user closes their mic.
    this.close();
  }
  close(){
    const worker=this.worker;this.worker=null;this.ready=false;this.loading=null;
    for(const job of this.pending.values()){
      clearTimeout(job.timer);job.reject(Error('Voice transcription canceled'));
    }
    this.pending.clear();if(worker)worker.terminate().catch(()=>{});
  }
}
module.exports={MyaLocalListening,MODEL};
