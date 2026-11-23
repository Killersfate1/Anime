'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  MyaLocalEngine, isGGUF, isLlamaServer, toChatMessages, parseSSE, normalizeConfig
} = require('./local-engine.cjs');

function sandbox(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'mya-runtime-test-'));
  t.after(() => fs.rmSync(folder, { recursive:true, force:true }));
  const enginePath = path.join(folder, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
  fs.writeFileSync(enginePath, 'test executable placeholder');
  const modelPath = path.join(folder, 'mya.gguf');
  const bytes = Buffer.alloc(1024 * 1024 + 32);
  bytes.write('GGUF', 0, 'ascii');
  fs.writeFileSync(modelPath, bytes);
  return { folder, enginePath, modelPath };
}
test('validates GGUF magic and selected local llama.cpp binary', t => {
  const {folder,enginePath,modelPath} = sandbox(t);
  assert.equal(isGGUF(modelPath),true);
  assert.equal(isLlamaServer(enginePath),true);
  const invalid = path.join(folder,'wrong.gguf');
  fs.writeFileSync(invalid,Buffer.alloc(1024*1024));
  assert.equal(isGGUF(invalid),false);
  assert.equal(isLlamaServer(path.join(folder,'other.exe')),false);
});
test('normalizes GPU layers and context bounds safely', () => {
  assert.equal(normalizeConfig({gpuLayers:1000}).gpuLayers,99);
  assert.equal(normalizeConfig({gpuLayers:-23}).gpuLayers,0);
  assert.equal(normalizeConfig({contextSize:999999}).contextSize,16384);
});
test('model settings persist without model bytes or cloud access', t => {
  const {folder,enginePath,modelPath} = sandbox(t);
  const configPath = path.join(folder,'engine.json');
  const app = new MyaLocalEngine({configPath,fetchImpl:()=>{throw Error('network not allowed')}});
  app.setFile('engine',enginePath);
  app.setFile('model',modelPath);
  app.configureOptions({gpuLayers:2,contextSize:8192});
  const restarted = new MyaLocalEngine({configPath,fetchImpl:()=>{throw Error('network not allowed')}});
  assert.equal(restarted.status().modelName,'mya.gguf');
  assert.equal(restarted.status().gpuLayers,2);
  assert.equal(restarted.status().ready,false);
});
test('rejects vision images unless a projector has been approved', () => {
  assert.throws(() => toChatMessages([{role:'user',content:'look',images:['abc']}],false),
    /multimodal/i);
  const messages = toChatMessages([{role:'system',content:'hello'}, {role:'user',content:'look',images:['abc']}],true);
  assert.equal(messages[1].content[1].image_url.url,'data:image/png;base64,abc');
});
test('stream parser collects chunks, delivers tokens and ends on DONE', async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
    controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" Mya"}}]}\n\n'));
    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    controller.close();
  } });
  const updates=[];
  const answer = await parseSSE({body:stream},delta=>updates.push(delta));
  assert.equal(answer,'Hello Mya');
  assert.deepEqual(updates,['Hello',' Mya']);
});
test('runs only a locally selected llama-server with loopback host and streams chat', async t => {
  const {folder,enginePath,modelPath} = sandbox(t);
  let argumentsUsed = null;
  let calls = 0;
  const fakeSpawn = (binary,args,options) => {
    assert.equal(binary,enginePath);
    assert.equal(options.shell,false);
    argumentsUsed = args;
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = () => proc.emit('exit',0,null);
    return proc;
  };
  const fakeFetch = async (url,params) => {
    if (url.endsWith('/health')) {
      calls++;
      if (calls===1) throw Error('not running yet');
      return {ok:true,json:async()=>({status:'ok'})};
    }
    assert.ok(url.startsWith('http://127.0.0.1:'));
    assert.ok(url.endsWith('/v1/chat/completions'));
    const body = JSON.parse(params.body);
    assert.equal(body.stream,false);
    assert.equal(body.messages[0].content,'Hello');
    return {ok:true,json:async()=>({choices:[{message:{content:'Hi!'}}]})};
  };
  const runtime = new MyaLocalEngine({
    configPath:path.join(folder,'engine.json'),spawnImpl:fakeSpawn,fetchImpl:fakeFetch,port:18999
  });
  runtime.setFile('engine',enginePath);
  runtime.setFile('model',modelPath);
  assert.equal((await runtime.start()).ready,true);
  assert.deepEqual(argumentsUsed.slice(0,6),['--model',modelPath,'--host','127.0.0.1','--port','18999']);
  const reply=await runtime.complete([{role:'user',content:'Hello'}]);
  assert.equal(reply,'Hi!');
  assert.equal(runtime.stop().state,'stopped');
});
