'use strict';
const fs=require('node:fs'),path=require('node:path');
const {ModelProcessWorker:Worker}=require('../model-process-worker.cjs');
const MODEL='Xenova/all-MiniLM-L6-v2';
class LocalEmbeddingProvider{
  constructor({dataDir,WorkerType=Worker}={}){
    if(!dataDir)throw Error('Local embeddings need a private cache folder');
    this.dataDir=dataDir;this.WorkerType=WorkerType;
    this.modelId=MODEL;this.ready=false;this.worker=null;this.pending=new Map();
    this.nextId=0;this.initializing=null;this.error='';
    this.marker=path.join(dataDir,'embedding-installed.json');
  }
  installed(){try{return JSON.parse(fs.readFileSync(this.marker,'utf8'))?.model===MODEL;}catch{return false;}}
  status(){return {installed:this.installed(),ready:this.ready,model:this.modelId,error:this.error};}
  workerStart(){
    if(this.worker)return;
    const worker=new this.WorkerType(path.join(__dirname,'embedding-worker.mjs'),{
      workerData:{cacheDir:path.join(this.dataDir,'cache')}
    });
    this.worker=worker;
    worker.on('message',result=>{
      const job=this.pending.get(result.id);if(!job)return;
      this.pending.delete(result.id);clearTimeout(job.timer);
      result.ok?job.resolve(result):job.reject(Error(result.error||'Embedding worker failed'));
    });
    const fail=error=>{
      if(this.worker!==worker)return;
      this.worker=null;this.ready=false;this.error=String(error?.message||error);
      for(const job of this.pending.values()){clearTimeout(job.timer);job.reject(Error(this.error));}
      this.pending.clear();
    };
    worker.on('error',fail);
    worker.on('exit',code=>fail(Error('Embedding worker stopped '+code)));
  }
  request(type,options={},timeout=180000){
    this.workerStart();
    const id=++this.nextId;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Local embedding timed out'));},timeout);
      this.pending.set(id,{timer,resolve,reject});
      this.worker.postMessage({id,type,...options});
    });
  }
  async initialize({allowDownload=false}={}){
    if(this.ready)return this.status();
    if(!allowDownload&&!this.installed())return this.status();
    if(this.initializing)return this.initializing;
    this.initializing=this.request('init',{allowDownload},300000).then(()=>{
      this.ready=true;this.error='';
      fs.mkdirSync(this.dataDir,{recursive:true,mode:0o700});
      fs.writeFileSync(this.marker,JSON.stringify({model:MODEL,installedAt:new Date().toISOString()}),{mode:0o600});
      return this.status();
    }).catch(error=>{this.error=error.message;return this.status();}).finally(()=>this.initializing=null);
    return this.initializing;
  }
  async embed(text){
    if(!this.ready)throw Error('Offline semantic model is not installed');
    const result=await this.request('embed',{text},60000);
    return result.vector;
  }
  close(){
    const worker=this.worker;this.worker=null;this.ready=false;
    for(const job of this.pending.values()){clearTimeout(job.timer);job.reject(Error('Closing embedding worker'));}
    this.pending.clear();if(worker)worker.terminate().catch(()=>{});
  }
}
module.exports={LocalEmbeddingProvider,MODEL};
