'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
  os=require('node:os'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const {downloadPinned,FILES}=require('./brain-installer.cjs');
function sandbox(t){
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'mya-brain-download-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  return folder;
}
test('installer restricts inference to vetted official distribution and pinned hashes',()=>{
  assert.match(FILES.engine.url,/^https:\/\/github\.com\/ggml-org\/llama\.cpp\/releases\/download\//);
  assert.match(FILES.model.url,/^https:\/\/huggingface\.co\/Qwen\/Qwen3-4B-GGUF\/resolve\//);
  assert.match(FILES.engine.sha256,/^[a-f0-9]{64}$/);
  assert.match(FILES.model.sha256,/^[a-f0-9]{64}$/);
});
test('download validates SHA256 and writes atomically',async t=>{
  const root=sandbox(t);
  const payload=new TextEncoder().encode('Verified offline brain model bytes');
  const hash=crypto.createHash('sha256').update(payload).digest('hex');
  const progress=[];
  const data={
    url:'https://example.com/approved.gguf',
    sha256:hash,maxSize:1024
  };
  const file=path.join(root,'model.gguf');
  const fetchImpl=async()=>new Response(payload,{status:200,headers:{'content-length':String(payload.length)}});
  await downloadPinned(data,file,{fetchImpl,onProgress:p=>progress.push(p)});
  assert.equal(fs.readFileSync(file,'utf8'),'Verified offline brain model bytes');
  assert.equal(fs.existsSync(file+'.partial'),false);
  assert.ok(progress.length>=1);
});
test('installer rejects incorrect hashes and removes partial models',async t=>{
  const root=sandbox(t),file=path.join(root,'bad.gguf');
  const data={url:'https://example.com/approved.gguf',sha256:'a'.repeat(64),maxSize:1024};
  await assert.rejects(downloadPinned(data,file,{
    fetchImpl:async()=>new Response(new TextEncoder().encode('BAD'),{status:200})
  }),/integrity/);
  assert.equal(fs.existsSync(file),false);
  assert.equal(fs.existsSync(file+'.partial'),false);
});
test('installer rejects HTTP plaintext and overlarge downloads',async t=>{
  const root=sandbox(t),file=path.join(root,'large.gguf');
  await assert.rejects(downloadPinned({
    url:'http://example.com',sha256:'a'.repeat(64),maxSize:500
  },file,{fetchImpl:async()=>null}),/HTTPS/);
  await assert.rejects(downloadPinned({
    url:'https://example.com/m',sha256:'a'.repeat(64),maxSize:2
  },file,{fetchImpl:async()=>new Response(new Uint8Array([1,2,3,4]),{status:200})}),/exceeds/);
});
