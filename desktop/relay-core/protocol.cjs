'use strict';
// Versioned app-local protocol shared by Electron, independent AI modules,
// and a future opt-in Unity native bridge. No external port or cloud endpoint.
const VERSION=1;
const REQUESTS=Object.freeze({
  'conversation.prepare':'Prepare a memory-aware prompt',
  'conversation.turn':'Commit a completed, locally generated turn',
  'memory.search':'Retrieve approved context from SQLite',
  'memory.list':'Inspect approved facts',
  'memory.pending':'Inspect unapproved candidate facts',
  'memory.approve':'Approve one candidate',
  'memory.reject':'Reject one candidate',
  'memory.reset':'Delete all personal data'
});
const EVENTS=Object.freeze({
  'assistant.delta':'Partial response text',
  'assistant.done':'Completed response',
  'memory.candidate':'New local memory awaiting review',
  'avatar.talk.start':'Start speaking pose',
  'avatar.talk.stop':'Stop speaking pose',
  'avatar.emotion':'Select a supported animation emotion'
});
function validateEnvelope(input,{event=false}={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||input.version!==VERSION)
    throw Error('Unsupported Relay protocol version');
  const allowed=event?EVENTS:REQUESTS;
  if(!Object.hasOwn(allowed,input.type))throw Error('Unknown Relay protocol message');
  if(typeof input.id!=='string'||!/^[A-Za-z0-9_-]{1,70}$/.test(input.id))
    throw Error('Invalid Relay request ID');
  if(input.payload==null||typeof input.payload!=='object'||Array.isArray(input.payload))
    throw Error('Relay payload must be a JSON object');
  if(JSON.stringify(input.payload).length>12000)throw Error('Relay message exceeds size limit');
  return {version:VERSION,type:input.type,id:input.id,payload:input.payload};
}
class RelayLocalInterface {
  constructor({manager,repository,retriever}){
    if(!manager||!repository||!retriever)throw Error('Relay local interface missing components');
    Object.assign(this,{manager,repository,retriever});
  }
  async dispatch(input){
    const r=validateEnvelope(input);
    switch(r.type){
      case 'conversation.prepare':return this.manager.prepare(r.payload.text,{limit:12});
      case 'conversation.turn':return this.manager.finish(r.payload.text,r.payload.response);
      case 'memory.search':return this.retriever.retrieve(String(r.payload.query||''),{limit:12});
      case 'memory.list':return this.repository.facts('active',200);
      case 'memory.pending':return this.repository.facts('pending',200);
      case 'memory.approve':return this.repository.approve(String(r.payload.id||''));
      case 'memory.reject':return {ok:this.repository.reject(String(r.payload.id||''))};
      case 'memory.reset':return {ok:(this.repository.reset(),this.manager.startConversation(),true)};
    }
    throw Error('Unsupported Relay operation');
  }
}
module.exports={VERSION,REQUESTS,EVENTS,validateEnvelope,RelayLocalInterface};
