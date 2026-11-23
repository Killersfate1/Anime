'use strict';
// Preflight for building a self-contained Windows Mya installer.
// Avoid producing a misleading "fully local" installer missing the AI runtime.
const fs=require('node:fs');
const path=require('node:path');
const {isGGUF}=require('./local-engine.cjs');
const root=path.join(__dirname,'runtime');
function verifyBundledBrain(rootDir=root){
  const engine=path.join(rootDir,'llama-server.exe');
  if(!fs.existsSync(engine))
    throw Error('Missing runtime/llama-server.exe. Extract the official llama.cpp Windows build (with its DLLs) into desktop/runtime before packaging.');
  const models=path.join(rootDir,'models');
  const ggufs=fs.existsSync(models)
    ? fs.readdirSync(models).filter(name=>isGGUF(path.join(models,name))):[];
  if(ggufs.length!==1)
    throw Error('Bundle exactly ONE valid instruction-tuned GGUF in desktop/runtime/models/. Found '+ggufs.length+'.');
  const file=path.join(models,ggufs[0]);
  return {engine,model:file,sizeBytes:fs.statSync(file).size};
}
if(require.main===module){
  try{
    if(process.platform!=='win32')
      throw Error('Build the self-contained Windows installer on Windows.');
    const result=verifyBundledBrain();
    console.log('Mya AI installer ready: '+path.basename(result.model)+
      ' ('+Math.round(result.sizeBytes/1024/1024)+' MB).');
    console.log('Review the GGUF model and runtime redistribution licenses before sharing any installer.');
  }catch(error){
    console.error(error.message);
    process.exitCode=1;
  }
}
module.exports={verifyBundledBrain};
