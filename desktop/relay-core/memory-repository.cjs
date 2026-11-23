'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const clean=(v,max=1000)=>typeof v==='string'?v.trim().slice(0,max):'';
const norm=v=>String(v||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const clamp=v=>Number.isFinite(Number(v))?Math.max(0,Math.min(1,Number(v))):0.5;
const types=new Set(['note','preference','project','shared_activity','conversation','relationship','profile','interest']);
function factKey(d){
  if(d.factKey)return clean(d.factKey,160);
  const kind=d.kind||'note',name=norm(d.predicate||kind);
  const suffix=!d.predicate||kind==='note'||kind==='shared_activity'||kind==='conversation'
    ?':'+crypto.createHash('sha256').update(norm(d.content)).digest('hex').slice(0,12):'';
  return norm(d.subject||'user')+'|'+name+suffix;
}
function fts(text){
  const tokens=[...new Set((norm(text).match(/[\p{L}\p{N}]{2,}/gu)||[]).slice(0,8))];
  return tokens.length?tokens.map(t=>'"'+t+'"*').join(' OR '):null;
}
function toBlob(vec){
  if(!Array.isArray(vec)&&!(vec instanceof Float32Array))throw Error('Invalid vector');
  if(vec.length<2||vec.length>1536||!Array.from(vec).every(Number.isFinite))throw Error('Invalid vector');
  return Buffer.from(Float32Array.from(vec).buffer);
}
function fromBlob(b){
  if(!b||b.length%4)return null;
  // node:sqlite returns Uint8Array, not necessarily a Node Buffer.
  const bytes=Buffer.from(b.buffer,b.byteOffset,b.byteLength);
  const a=[];for(let i=0;i<bytes.length;i+=4)a.push(bytes.readFloatLE(i));return a;
}
class MemoryRepository {
  constructor(filename=':memory:') {
    this.filename=filename;
    if(filename!==':memory:')fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
    if(filename!==':memory:'){
      try{fs.chmodSync(filename,0o600);}catch{}
      this.db.exec('PRAGMA journal_mode=WAL;');
    }
    this.db.exec('PRAGMA trusted_schema=OFF;');
    this.schema();
  }
  schema(){
    this.db.exec([
      'CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT NOT NULL);',
      `CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,context TEXT NOT NULL DEFAULT '',started_at TEXT NOT NULL,updated_at TEXT NOT NULL);`,
      `CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('user','assistant')),content TEXT NOT NULL,created_at TEXT NOT NULL,sequence INTEGER NOT NULL,UNIQUE(conversation_id,sequence));`,
      'CREATE INDEX IF NOT EXISTS messages_order ON messages(conversation_id,sequence);',
      `CREATE TABLE IF NOT EXISTS facts(id TEXT PRIMARY KEY,kind TEXT NOT NULL,content TEXT NOT NULL,fact_key TEXT NOT NULL,subject TEXT NOT NULL,predicate TEXT NOT NULL,value TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','active','superseded','rejected')),sensitivity TEXT NOT NULL DEFAULT 'standard',source TEXT NOT NULL DEFAULT 'user',source_message_id TEXT,importance REAL NOT NULL,confidence REAL NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,last_accessed_at TEXT,conflict_with TEXT,supersedes TEXT);`,
      'CREATE INDEX IF NOT EXISTS facts_key_status ON facts(fact_key,status);',
      'CREATE TABLE IF NOT EXISTS episodes(id TEXT PRIMARY KEY,conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,kind TEXT NOT NULL,title TEXT NOT NULL,summary TEXT NOT NULL,event_at TEXT NOT NULL,importance REAL NOT NULL,source TEXT NOT NULL,created_at TEXT NOT NULL);',
      'CREATE INDEX IF NOT EXISTS episodes_date ON episodes(event_at DESC);',
      `CREATE TABLE IF NOT EXISTS vectors(memory_type TEXT NOT NULL CHECK(memory_type IN ('semantic','episodic')),memory_id TEXT NOT NULL,model TEXT NOT NULL,dimension INTEGER NOT NULL,embedding BLOB NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(memory_type,memory_id));`,
      `CREATE TABLE IF NOT EXISTS relationship(id INTEGER PRIMARY KEY CHECK(id=1),interaction_count INTEGER NOT NULL DEFAULT 0,shared_experience_count INTEGER NOT NULL DEFAULT 0,familiarity REAL NOT NULL DEFAULT 0,communication_style TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL);`,
      `INSERT OR IGNORE INTO relationship(id,updated_at) VALUES(1,'1970-01-01T00:00:00Z');`,
      `CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(content,content='facts',content_rowid='rowid',tokenize='unicode61');`,
      `CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(title,summary,content='episodes',content_rowid='rowid',tokenize='unicode61');`,
      'CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN INSERT INTO facts_fts(rowid,content) VALUES(new.rowid,new.content); END;',
      `CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN INSERT INTO facts_fts(facts_fts,rowid,content) VALUES('delete',old.rowid,old.content); DELETE FROM vectors WHERE memory_type='semantic' AND memory_id=old.id; END;`,
      `CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE OF content ON facts BEGIN INSERT INTO facts_fts(facts_fts,rowid,content) VALUES('delete',old.rowid,old.content); INSERT INTO facts_fts(rowid,content) VALUES(new.rowid,new.content); DELETE FROM vectors WHERE memory_type='semantic' AND memory_id=new.id; END;`,
      'CREATE TRIGGER IF NOT EXISTS episodes_ai AFTER INSERT ON episodes BEGIN INSERT INTO episodes_fts(rowid,title,summary) VALUES(new.rowid,new.title,new.summary); END;',
      `CREATE TRIGGER IF NOT EXISTS episodes_ad AFTER DELETE ON episodes BEGIN INSERT INTO episodes_fts(episodes_fts,rowid,title,summary) VALUES('delete',old.rowid,old.title,old.summary); DELETE FROM vectors WHERE memory_type='episodic' AND memory_id=old.id; END;`,
      `CREATE TRIGGER IF NOT EXISTS episodes_au AFTER UPDATE OF title,summary ON episodes BEGIN INSERT INTO episodes_fts(episodes_fts,rowid,title,summary) VALUES('delete',old.rowid,old.title,old.summary); INSERT INTO episodes_fts(rowid,title,summary) VALUES(new.rowid,new.title,new.summary); DELETE FROM vectors WHERE memory_type='episodic' AND memory_id=new.id; END;`
    ].join('\n'));
  }
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const x=fn();this.db.exec('COMMIT');return x;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  meta(key){return this.db.prepare('SELECT v FROM meta WHERE k=?').get(key)?.v||null;}
  setMeta(key,value){this.db.prepare('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(key,String(value));}
  beginConversation(id=uid(),context=''){
    const t=now();
    this.db.prepare('INSERT OR IGNORE INTO conversations(id,context,started_at,updated_at) VALUES(?,?,?,?)').run(id,clean(context,100),t,t);
    return id;
  }
  appendTurn(conversationId,question,answer){
    const q=clean(question,4000),a=clean(answer,12000);
    if(!q||!a)throw Error('Cannot save incomplete conversation turn');
    this.tx(()=>{
      this.beginConversation(conversationId);
      const offset=this.db.prepare('SELECT COALESCE(MAX(sequence),0) n FROM messages WHERE conversation_id=?').get(conversationId).n;
      const st=this.db.prepare('INSERT INTO messages(id,conversation_id,role,content,created_at,sequence) VALUES(?,?,?,?,?,?)');
      const t=now();st.run(uid(),conversationId,'user',q,t,offset+1);st.run(uid(),conversationId,'assistant',a,t,offset+2);
      this.db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run(t,conversationId);
    });
  }
  messages(id,limit=40){return this.db.prepare('SELECT id,role,content,created_at FROM messages WHERE conversation_id=? ORDER BY sequence DESC LIMIT ?').all(id,Math.min(50000,Math.max(1,limit))).reverse();}
  listConversations(limit=30){return this.db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?').all(Math.min(10000,Math.max(1,limit)));}
  eraseConversation(id){return this.db.prepare('DELETE FROM conversations WHERE id=?').run(id).changes>0;}
  saveFact(d={},options={}){
    const content=clean(d.content,500);if(!content)return {ok:false,error:'Memory text is required'};
    const kind=types.has(d.kind)?d.kind:'note',key=factKey({...d,kind,content});
    const previous=this.db.prepare(`SELECT * FROM facts WHERE fact_key=? AND status='active' ORDER BY updated_at DESC LIMIT 1`).get(key);
    if(previous&&norm(previous.content)===norm(content))return {ok:true,id:previous.id,duplicate:true,status:'active'};
    const duplicate=this.db.prepare(`SELECT id FROM facts WHERE fact_key=? AND content=? AND status='pending'`).get(key,content);
    if(duplicate)return {ok:true,id:duplicate.id,duplicate:true,status:'pending'};
    const status=options.autoApprove&&!previous&&d.sensitivity!=='sensitive'?'active':'pending',id=uid(),t=now();
    this.db.prepare('INSERT INTO facts(id,kind,content,fact_key,subject,predicate,value,status,sensitivity,source,source_message_id,importance,confidence,created_at,updated_at,conflict_with) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,kind,content,key,clean(d.subject,60)||'user',clean(d.predicate,80),clean(d.value,300),
        status,d.sensitivity==='sensitive'?'sensitive':'standard',clean(d.source,30)||'user',
        clean(d.sourceMessageId,80)||null,clamp(d.importance??0.5),clamp(d.confidence??0.7),t,t,previous?.id||null);
    return {ok:true,id,status,conflictWith:previous?.id||null};
  }
  approve(id){
    return this.tx(()=>{
      const fact=this.db.prepare(`SELECT * FROM facts WHERE id=? AND status='pending'`).get(id);
      if(!fact)return {ok:false,error:'Pending memory not found'};
      const prior=this.db.prepare(`SELECT id FROM facts WHERE fact_key=? AND status='active' AND id<>?`).all(fact.fact_key,id);
      const t=now();
      for(const old of prior)this.db.prepare(`UPDATE facts SET status='superseded',updated_at=? WHERE id=?`).run(t,old.id);
      this.db.prepare(`UPDATE facts SET status='active',supersedes=?,updated_at=? WHERE id=?`).run(prior[0]?.id||null,t,id);
      return {ok:true,id,superseded:prior.map(x=>x.id)};
    });
  }
  reject(id){return this.db.prepare(`UPDATE facts SET status='rejected',updated_at=? WHERE id=? AND status='pending'`).run(now(),id).changes>0;}
  facts(status='active',limit=200){
    if(!['active','pending','superseded','rejected'].includes(status))throw Error('Invalid memory state');
    return this.db.prepare('SELECT * FROM facts WHERE status=? ORDER BY updated_at DESC LIMIT ?').all(status,Math.min(10000,Math.max(1,limit)));
  }
  fact(id){return this.db.prepare('SELECT * FROM facts WHERE id=?').get(id)||null;}
  edit(id,data){
    const existing=this.fact(id),content=clean(data?.content,500);
    if(!existing||!content)return {ok:false,error:'Memory not found or empty'};
    this.db.prepare('UPDATE facts SET content=?,kind=?,importance=?,updated_at=? WHERE id=?').run(content,types.has(data.kind)?data.kind:existing.kind,clamp(data.importance??existing.importance),now(),id);
    return {ok:true,id};
  }
  deleteFact(id){return this.db.prepare('DELETE FROM facts WHERE id=?').run(id).changes>0;}
  clearFacts(){this.db.exec('DELETE FROM facts;'); return true;}

  addEpisode(d={}){
    const summary=clean(d.summary,1400);if(!summary)return null;
    const id=uid(),t=now();
    this.db.prepare('INSERT INTO episodes(id,conversation_id,kind,title,summary,event_at,importance,source,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id,d.conversationId||null,clean(d.kind,50)||'conversation',clean(d.title,180)||'Shared experience',
        summary,clean(d.eventAt,40)||t,clamp(d.importance??0.5),clean(d.source,30)||'conversation',t);
    return {id,summary};
  }
  episodes(limit=50){return this.db.prepare('SELECT * FROM episodes ORDER BY event_at DESC LIMIT ?').all(Math.min(10000,Math.max(1,limit)));}
  deleteEpisode(id){return this.db.prepare('DELETE FROM episodes WHERE id=?').run(id).changes>0;}
  searchFacts(text,limit=16){
    const query=fts(text);if(!query)return [];
    return this.db.prepare(`SELECT f.*,bm25(facts_fts) rank FROM facts_fts JOIN facts f ON f.rowid=facts_fts.rowid WHERE facts_fts MATCH ? AND f.status='active' ORDER BY rank LIMIT ?`).all(query,Math.min(80,limit));
  }
  searchEpisodes(text,limit=12){
    const query=fts(text);if(!query)return [];
    return this.db.prepare('SELECT e.*,bm25(episodes_fts) rank FROM episodes_fts JOIN episodes e ON e.rowid=episodes_fts.rowid WHERE episodes_fts MATCH ? ORDER BY rank LIMIT ?').all(query,Math.min(80,limit));
  }
  storeVector(type,id,model,vector){
    if(!['semantic','episodic'].includes(type))throw Error('Invalid vector type');
    const table=type==='semantic'?'facts':'episodes';
    if(!this.db.prepare('SELECT id FROM '+table+' WHERE id=?').get(id))return false;
    const blob=toBlob(vector);
    this.db.prepare('INSERT INTO vectors(memory_type,memory_id,model,dimension,embedding,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(memory_type,memory_id) DO UPDATE SET model=excluded.model,dimension=excluded.dimension,embedding=excluded.embedding,updated_at=excluded.updated_at')
      .run(type,id,clean(model,120),blob.length/4,blob,now());
    return true;
  }
  vectorCandidates(type,model,limit=1800){
    if(!['semantic','episodic'].includes(type))return [];
    const table=type==='semantic'?'facts':'episodes';
    const active=type==='semantic'?`AND m.status='active'`:'';
    return this.db.prepare('SELECT v.memory_id,v.embedding,m.* FROM vectors v JOIN '+table+' m ON m.id=v.memory_id WHERE v.memory_type=? AND v.model=? '+active+' ORDER BY v.updated_at DESC LIMIT ?')
      .all(type,model,Math.min(5000,limit)).map(x=>({...x,embedding:undefined,vector:fromBlob(x.embedding)}));
  }
  unindexed(type,limit=12){
    if(!['semantic','episodic'].includes(type))return [];
    const table=type==='semantic'?'facts':'episodes';
    const active=type==='semantic'?`AND m.status='active'`:'';
    return this.db.prepare('SELECT m.* FROM '+table+' m LEFT JOIN vectors v ON v.memory_type=? AND v.memory_id=m.id WHERE v.memory_id IS NULL '+active+' ORDER BY m.created_at DESC LIMIT ?').all(type,Math.min(80,limit));
  }
  relationship(){
    const s=this.db.prepare('SELECT * FROM relationship WHERE id=1').get();
    return {...s,communication_style:JSON.parse(s.communication_style||'{}')};
  }
  updateRelationship(input={}){
    const old=this.relationship(),interactions=old.interaction_count+Math.max(0,Math.min(3,Math.floor(input.interactions||0))),
      shared=old.shared_experience_count+Math.max(0,Math.min(3,Math.floor(input.experiences||0)));
    const familiarity=Math.min(1,Math.log1p(interactions)/Math.log(501));
    const style=input.communicationStyle&&typeof input.communicationStyle==='object'
      ?{...old.communication_style,...input.communicationStyle}:old.communication_style;
    this.db.prepare('UPDATE relationship SET interaction_count=?,shared_experience_count=?,familiarity=?,communication_style=?,updated_at=? WHERE id=1')
      .run(interactions,shared,familiarity,JSON.stringify(style).slice(0,1800),now());
    return this.relationship();
  }
  countMessages(id){return this.db.prepare('SELECT COUNT(*) n FROM messages WHERE conversation_id=?').get(id).n;}
  touch(id){this.db.prepare('UPDATE facts SET last_accessed_at=? WHERE id=?').run(now(),id);}
  reset(){
    this.tx(()=>this.db.exec(`DELETE FROM vectors; DELETE FROM facts; DELETE FROM episodes; DELETE FROM messages; DELETE FROM conversations; DELETE FROM meta; DELETE FROM relationship; INSERT INTO relationship(id,updated_at) VALUES(1,'1970-01-01T00:00:00Z');`));
    try{this.db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');}catch{}
  }
  close(){this.db.close();}
}
module.exports={MemoryRepository,norm,fts,factKey,toBlob,fromBlob};
