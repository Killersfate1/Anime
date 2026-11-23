import {parentPort,workerData} from 'node:worker_threads';
import {mkdir} from 'node:fs/promises';
const MODEL='Xenova/all-MiniLM-L6-v2';
let extractor=null,loading=null;
const reply=(id,result)=>parentPort.postMessage({id,...result});
async function load(allowDownload){
  if(extractor)return;
  if(loading)return loading;
  loading=(async()=>{
    const {pipeline,env}=await import('@huggingface/transformers');
    await mkdir(workerData.cacheDir,{recursive:true});
    env.cacheDir=workerData.cacheDir;
    env.allowRemoteModels=allowDownload===true;
    env.allowLocalModels=true;
    extractor=await pipeline('feature-extraction',MODEL,{dtype:'q8',device:'cpu'});
  })().finally(()=>loading=null);
  return loading;
}
parentPort.on('message',async msg=>{
  const {id,type}=msg||{};
  if(typeof id!=='number')return;
  try{
    if(type==='init'){await load(msg.allowDownload===true);reply(id,{ok:true,type:'ready'});return;}
    if(type==='embed'){
      if(!extractor)throw Error('Local embedding model is not loaded');
      const text=String(msg.text||'').slice(0,1800);
      if(!text.trim())throw Error('No text to embed');
      const tensor=await extractor(text,{pooling:'mean',normalize:true});
      const vector=Array.from(tensor.data||[]);
      if(vector.length<2||!vector.every(Number.isFinite))throw Error('Invalid neural embedding');
      reply(id,{ok:true,vector});return;
    }
    throw Error('Unknown embedding request');
  }catch(error){reply(id,{ok:false,error:String(error.message||error).slice(0,300)});}
});
