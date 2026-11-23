'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
  os=require('node:os'),path=require('node:path'),fs=require('node:fs');
const {MemoryRepository}=require('./memory-repository.cjs');
const {MemoryExtractor}=require('./memory-extractor.cjs');
const {MemoryRetriever,cosine}=require('./memory-retriever.cjs');
const {MemoryConsolidator}=require('./memory-consolidator.cjs');
const {ConversationManager}=require('./conversation-manager.cjs');
const {RelationshipStateManager}=require('./relationship-state-manager.cjs');
function fresh(t){
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'relay-mem-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const filename=path.join(folder,'relay.sqlite');
  const db=new MemoryRepository(filename);
  t.after(()=>{try{db.close();}catch{}});
  return {db,filename};
}
test('SQLite persists approved facts and complete conversations between launches',t=>{
  const {db,filename}=fresh(t);
  const saved=db.saveFact({kind:'preference',predicate:'likes',content:'User likes tactical co-op games'},
    {autoApprove:true});
  assert.equal(saved.status,'active');
  const id=db.beginConversation('session-1','gaming');
  db.appendTurn(id,'Remember our game?','I remember the co-op survival game!');
  db.close();
  const reopen=new MemoryRepository(filename);
  assert.equal(reopen.facts().length,1);
  assert.equal(reopen.messages(id).length,2);
  assert.match(reopen.messages(id)[0].content,/our game/);
  reopen.close();
});
test('FTS5 retrieval finds memories by keyword without reading unapproved candidates',t=>{
  const {db}=fresh(t);
  db.saveFact({kind:'preference',predicate:'likes',content:'User loves spicy ramen'}, {autoApprove:true});
  db.saveFact({kind:'project',predicate:'project',content:'User is building a zombie game'}, {autoApprove:false});
  assert.equal(db.searchFacts('ramen')[0].content,'User loves spicy ramen');
  assert.equal(db.searchFacts('zombie').length,0);
  assert.equal(db.facts('pending').length,1);
});
test('contradiction candidate retains old fact until user approves replacement',t=>{
  const {db}=fresh(t);
  const original=db.saveFact({kind:'preference',predicate:'favorite color',content:'Favorite color is blue'}, {autoApprove:true});
  const later=db.saveFact({kind:'preference',predicate:'favorite color',content:'Favorite color is red'}, {autoApprove:true});
  assert.equal(later.status,'pending');
  assert.equal(later.conflictWith,original.id);
  assert.equal(db.facts().length,1);
  const confirmed=db.approve(later.id);
  assert.deepEqual(confirmed.superseded,[original.id]);
  assert.equal(db.facts()[0].content,'Favorite color is red');
  assert.equal(db.facts('superseded')[0].content,'Favorite color is blue');
});
test('duplicate memory detection prevents redundant facts',t=>{
  const {db}=fresh(t);
  const a=db.saveFact({kind:'project',predicate:'current project',content:'Working on Relay'}, {autoApprove:true});
  const b=db.saveFact({kind:'project',predicate:'current project',content:'Working on Relay'},{autoApprove:true});
  assert.equal(a.id,b.id);
  assert.equal(db.facts().length,1);
});
test('semantic vectors retrieve paraphrases via locally supplied dense embeddings',async t=>{
  const {db}=fresh(t);
  const game=db.saveFact({kind:'interest',predicate:'interests',content:'User plays strategic cooperative survival titles'}, {autoApprove:true});
  const food=db.saveFact({kind:'preference',predicate:'food',content:'User likes pasta'}, {autoApprove:true});
  const embedder={modelId:'test-offline-embeddings',ready:true,async embed(q){return [0.9,0.1,0];}};
  db.storeVector('semantic',game.id,embedder.modelId,[1,0,0]);
  db.storeVector('semantic',food.id,embedder.modelId,[0,1,0]);
  const results=await new MemoryRetriever(db,{embedder}).retrieve('co-op game',{limit:2});
  assert.equal(results[0].id,game.id);
  assert.ok(cosine([1,0],[1,0])>cosine([1,0],[0,1]));
});
test('editing and deleting also invalidates stored vector index',t=>{
  const {db}=fresh(t);
  const id=db.saveFact({kind:'note',content:'Original statement'},{autoApprove:true}).id;
  db.storeVector('semantic',id,'mini',[1,0]);
  assert.equal(db.vectorCandidates('semantic','mini').length,1);
  assert.equal(db.edit(id,{content:'Corrected statement'}).ok,true);
  assert.equal(db.vectorCandidates('semantic','mini').length,0);
  db.storeVector('semantic',id,'mini',[1,0]);
  assert.equal(db.deleteFact(id),true);
  assert.equal(db.searchFacts('corrected').length,0);
  assert.equal(db.vectorCandidates('semantic','mini').length,0);
});
test('candidate extractor excludes secrets and only proposes user-stated facts',async()=>{
  const extractor=new MemoryExtractor();
  assert.equal((await extractor.candidates('My API key is sk-secret-secret')).length,0);
  const candidates=await extractor.candidates('I really love strategy games');
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].kind,'preference');
});
test('conversation pipeline saves replies, proposes pending facts, updates rapport',async t=>{
  const {db}=fresh(t);
  const rel=new RelationshipStateManager(db),retriever=new MemoryRetriever(db);
  const manager=new ConversationManager({repository:db,retriever,
    extractor:new MemoryExtractor(),relationship:rel,consolidator:null});
  const before=await manager.prepare('I love tactical games');
  assert.deepEqual(before.history,[]);
  const saved=await manager.finish('I love tactical games','Those are so fun!',{consolidate:false});
  assert.equal(saved.saved,true);
  assert.equal(db.messages(manager.conversationId).length,2);
  assert.equal(db.relationship().interaction_count,1);
  assert.equal(db.facts('pending').length,1);
  assert.equal(db.facts('active').length,0);
  const next=await manager.prepare('Do you remember?');
  assert.equal(next.history.length,2);
});
test('episodic consolidation runs only after threshold and preserves timestamps',async t=>{
  const {db}=fresh(t),id=db.beginConversation('episode');
  const model={async generate(){return JSON.stringify({title:'Our session',summary:'We discussed the game project.',importance:0.8});}};
  const consolidator=new MemoryConsolidator(db,{inference:model,everyTurns:2});
  db.appendTurn(id,'Game conversation 1','Cool');
  assert.equal((await consolidator.maybeConsolidate(id)).skipped,'threshold');
  db.appendTurn(id,'Game conversation 2','Great');
  const result=await consolidator.maybeConsolidate(id);
  assert.ok(result.episode);
  assert.equal(db.episodes().length,1);
  assert.equal((await consolidator.maybeConsolidate(id)).skipped,'threshold');
});
test('privacy reset removes conversations, facts, episodes and vectors without residual FTS hits',t=>{
  const {db}=fresh(t),id=db.beginConversation('delete');
  db.appendTurn(id,'I like ramen','I remember');
  const fact=db.saveFact({kind:'note',content:'User likes ramen'}, {autoApprove:true});
  db.storeVector('semantic',fact.id,'offline',[0.8,0.1]);
  db.addEpisode({conversationId:id,summary:'We played games and cooked ramen',title:'Cooking'});
  db.updateRelationship({interactions:1,experiences:1});
  db.reset();
  assert.equal(db.facts().length,0);
  assert.equal(db.episodes().length,0);
  assert.equal(db.messages(id).length,0);
  assert.equal(db.searchFacts('ramen').length,0);
  assert.equal(db.searchEpisodes('games').length,0);
  assert.equal(db.vectorCandidates('semantic','offline').length,0);
  assert.equal(db.relationship().interaction_count,0);
});
