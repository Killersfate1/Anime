// Local Whisper speech recognition. Receives validated 16kHz mono WAV.
// Audio never leaves this process or reaches an external STT endpoint.
import {parentPort,workerData} from 'node:worker_threads';
import {mkdir} from 'node:fs/promises';
const MODEL='onnx-community/whisper-tiny.en';
let transcriber=null,loading=null;
const report=(id,data)=>parentPort.postMessage({id,...data});
async function initialize(allowDownload){
  if(transcriber)return;
  if(loading)return loading;
  loading=(async()=>{
    const {pipeline,env}=await import('@huggingface/transformers');
    await mkdir(workerData.cacheDir,{recursive:true});
    env.cacheDir=workerData.cacheDir;
    env.allowRemoteModels=allowDownload===true;
    env.allowLocalModels=true;
    transcriber=await pipeline('automatic-speech-recognition',MODEL,{dtype:'q8',device:'cpu'});
  })().finally(()=>{loading=null;});
  return loading;
}
function parseMonoWav(raw){
  const wav=Buffer.from(raw);
  if(wav.length<48||wav.length>550000||
     wav.toString('ascii',0,4)!=='RIFF'||
     wav.toString('ascii',8,12)!=='WAVE'||
     wav.toString('ascii',12,16)!=='fmt '||
     wav.readUInt16LE(20)!==1||
     wav.readUInt16LE(22)!==1||
     wav.readUInt32LE(24)!==16000||
     wav.readUInt16LE(34)!==16||
     wav.toString('ascii',36,40)!=='data'||
     wav.readUInt32LE(40)!==wav.length-44)
    throw Error('Invalid 16 kHz mono PCM WAV');
  const samples=new Float32Array((wav.length-44)/2);
  for(let i=0;i<samples.length;i++)samples[i]=wav.readInt16LE(44+2*i)/32768;
  return samples;
}
parentPort.on('message',async msg=>{
  const {id,type}=msg||{};
  if(typeof id!=='number')return;
  try{
    if(type==='init'){
      await initialize(msg.allowDownload===true);
      report(id,{ok:true,type:'ready'});return;
    }
    if(type==='transcribe'){
      if(!transcriber)throw Error('Install Mya local listening model first');
      const samples=parseMonoWav(msg.wav);
      const answer=await transcriber(samples,{return_timestamps:false});
      report(id,{ok:true,text:String(answer?.text||'').trim().slice(0,2000)});return;
    }
    throw Error('Unknown voice command');
  }catch(error){report(id,{ok:false,error:String(error.message||error).slice(0,350)});}
});
