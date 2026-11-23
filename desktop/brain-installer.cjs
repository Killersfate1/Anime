'use strict';
// One-time explicit local brain installation. Downloads only pinned, licensed
// binaries and GGUF files from their official distribution websites.
// No dialogue or user data is ever sent to these download endpoints.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {promises:fsp}=fs;
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const yauzl=require('yauzl');
const {isGGUF,isLlamaServer}=require('./local-engine.cjs');

const FILES=Object.freeze({
  engine:{
    url:'https://github.com/ggml-org/llama.cpp/releases/download/b10901/llama-b10901-bin-win-cpu-x64.zip',
    sha256:'6c803e4c7cc9e10c26e80701f913ecf4500cdf8144600440126a3c53889091a1',
    maxSize:500*1024*1024
  },
  model:{
    url:'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/a9a60d0/Qwen3-4B-Q4_K_M.gguf',
    sha256:'7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5',
    file:'Qwen3-4B-Q4_K_M.gguf',
    maxSize:4*1024*1024*1024
  }
});
const prettyBytes=n=>(n/1024/1024).toFixed(1)+' MiB';
function verifyHash(file,expected){
  return new Promise((resolve,reject)=>{
    const hash=crypto.createHash('sha256');
    const stream=fs.createReadStream(file);
    stream.on('data',chunk=>hash.update(chunk));
    stream.on('error',reject);
    stream.on('end',()=>resolve(hash.digest('hex')===expected));
  });
}
async function downloadPinned(file,target,{signal,onProgress=()=>{},fetchImpl=fetch}={}){
  if(!/^https:\/\//.test(file.url))throw Error('Only HTTPS model distributions are supported');
  const part=target+'.partial';
  await fsp.mkdir(path.dirname(target),{recursive:true,mode:0o700});
  try{
    const response=await fetchImpl(file.url,{
      redirect:'follow',signal,headers:{'User-Agent':'Mya-Local-Desktop/0.1'}
    });
    if(!response.ok||!response.body)throw Error('Model download returned HTTP '+response.status);
    if(response.url&&!response.url.startsWith('https://'))
      throw Error('An insecure download redirect was refused');
    const expectedLength=Number(response.headers.get('content-length')||0);
    if(expectedLength>file.maxSize)throw Error('Remote file exceeds allowed size');
    let current=0;
    const hash=crypto.createHash('sha256');
    const progress=new Transform({
      transform(chunk,_encoding,callback){
        current+=chunk.length;
        if(current>file.maxSize)return callback(Error('Download exceeds safety size limit'));
        hash.update(chunk);
        if(current===chunk.length||current%(8*1024*1024)<chunk.length)
          onProgress({current,total:expectedLength||0,unit:'bytes'});
        callback(null,chunk);
      }
    });
    await pipeline(Readable.fromWeb(response.body),progress,
      fs.createWriteStream(part,{mode:0o600}),{signal});
    if(expectedLength&&current!==expectedLength)
      throw Error('Download ended early: '+prettyBytes(current)+' of '+prettyBytes(expectedLength));
    const actual=hash.digest('hex');
    if(actual!==file.sha256)
      throw Error('Download integrity failure: SHA256 did not match the pinned official file');
    await fsp.rename(part,target);
    onProgress({current,total:current,unit:'bytes'});
    return target;
  }catch(error){
    try{await fsp.unlink(part);}catch{}
    throw error;
  }
}
async function extractOfficialEngine(zipPath,destination,{signal,onProgress=()=>{}}={}){
  await fsp.mkdir(destination,{recursive:true,mode:0o700});
  const zip=await new Promise((resolve,reject)=>{
    yauzl.open(zipPath,{lazyEntries:true,autoClose:true,strictFileNames:true},
      (err,file)=>err?reject(err):resolve(file));
  });
  let entries=0,totalUncompressed=0,exe=false;
  return new Promise((resolve,reject)=>{
    let finished=false;
    const fail=error=>{
      if(finished)return;
      finished=true;
      try{zip.close();}catch{}
      reject(error);
    };
    zip.on('error',fail);
    zip.on('end',()=>{
      if(finished)return;
      finished=true;
      if(!exe){reject(Error('Official archive did not contain llama-server.exe'));return;}
      resolve(path.join(destination,'llama-server.exe'));
    });
    zip.on('entry',async entry=>{
      try{
        if(signal?.aborted)throw Error('Brain installation canceled');
        if(++entries>1200)throw Error('Archive has too many files');
        const name=entry.fileName;
        if(name.startsWith('/')||name.includes('\\')||name.split('/').includes('..'))
          throw Error('Unsafe archive path');
        if(name.endsWith('/')){zip.readEntry();return;}
        const basename=path.posix.basename(name);
        if(!/^[A-Za-z0-9_.+()-]{1,130}$/.test(basename)){zip.readEntry();return;}
        if(!/\.(?:exe|dll|txt|md|license)$/i.test(basename)){zip.readEntry();return;}
        totalUncompressed+=entry.uncompressedSize;
        if(totalUncompressed>750*1024*1024||entry.uncompressedSize>350*1024*1024)
          throw Error('Archive expands beyond allowed size');
        const stream=await new Promise((res,rej)=>zip.openReadStream(entry,(error,value)=>
          error?rej(error):res(value)));
        const dest=path.join(destination,basename);
        const temp=dest+'.partial';
        await pipeline(stream,fs.createWriteStream(temp,{mode:0o600}),{signal});
        await fsp.rename(temp,dest);
        if(basename.toLowerCase()==='llama-server.exe')exe=true;
        onProgress({entry:basename});
        zip.readEntry();
      }catch(error){fail(error);}
    });
    zip.readEntry();
  });
}
class MyaBrainInstaller{
  constructor({dataDir,engine,onProgress=()=>{},fetchImpl=fetch}={}){
    if(!dataDir||!engine)throw Error('Brain installer requires private local storage and the owned engine');
    this.dataDir=dataDir;this.engine=engine;
    this.onProgress=onProgress;this.fetchImpl=fetchImpl;
    this.running=null;this.controller=null;
    this.progress={stage:'idle',message:'',current:0,total:0};
  }
  emit(stage,message,current=0,total=0){
    this.progress={stage,message,current,total};
    try{this.onProgress(this.status());}catch{}
  }
  status(){return {...this.progress,busy:!!this.running,modelName:FILES.model.file};}
  stop(){this.controller?.abort();return this.status();}
  async install(){
    if(this.running)return this.running;
    if(process.platform!=='win32')
      throw Error('This installer supports Windows x64 only.');
    if(this.engine.child||this.engine.starting)
      throw Error('Stop Mya AI before changing its local brain');
    const controller=new AbortController();this.controller=controller;
    this.running=(async()=>{
      const root=path.join(this.dataDir,'runtime');
      const archive=path.join(root,'llama-cpu-x64.zip');
      const modelPath=path.join(root,'models',FILES.model.file);
      const enginePath=path.join(root,'llama-server.exe');
      try{
        this.emit('engine','Getting Mya’s local inference engine from official llama.cpp…');
        if(!isLlamaServer(enginePath)){
          await downloadPinned(FILES.engine,archive,{
            signal:controller.signal,fetchImpl:this.fetchImpl,
            onProgress:p=>this.emit('engine','Downloading local engine · '+prettyBytes(p.current),p.current,p.total)
          });
          this.emit('extract','Installing Mya’s CPU inference engine…');
          await extractOfficialEngine(archive,root,{signal:controller.signal,
            onProgress:p=>this.emit('extract','Installing '+p.entry)});
          await fsp.unlink(archive).catch(()=>{});
        }
        if(!isLlamaServer(enginePath))throw Error('Mya inference engine executable is missing');
        this.emit('model','Downloading licensed Qwen3-4B model · approximately 2.5 GB…');
        if(!isGGUF(modelPath)||!(await verifyHash(modelPath,FILES.model.sha256))){
          await downloadPinned(FILES.model,modelPath,{
            signal:controller.signal,fetchImpl:this.fetchImpl,
            onProgress:p=>this.emit('model',
              'Downloading Mya’s mind · '+prettyBytes(p.current)+
              (p.total?' / '+prettyBytes(p.total):''),p.current,p.total)
          });
        }
        if(!isGGUF(modelPath))throw Error('Downloaded model is not valid GGUF');
        this.engine.setFile('engine',enginePath);
        this.engine.setFile('model',modelPath);
        this.emit('loading','Loading Mya’s local language model…');
        await this.engine.start();
        if(!this.engine.status().ready)throw Error('Mya did not become ready after model installation');
        this.emit('ready','Mya’s mind is ready. You can talk to her now.');
        return {ok:true,ready:true};
      }catch(error){
        this.emit('error',String(error.message||error));
        return {ok:false,error:String(error.message||error)};
      }finally{
        this.controller=null;
      }
    })().finally(()=>{this.running=null;});
    return this.running;
  }
}
module.exports={MyaBrainInstaller,FILES,downloadPinned,extractOfficialEngine,verifyHash};
