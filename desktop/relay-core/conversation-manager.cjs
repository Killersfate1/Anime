'use strict';
const crypto=require('node:crypto');
// The headless conversation pipeline can be called by Electron IPC, tests,
// or eventually a Unity bridge. No rendering, browser, or Unity dependencies.
class ConversationManager {
  constructor({repository,retriever,extractor,consolidator,relationship,inference}={}){
    if(!repository||!retriever||!extractor||!relationship)throw Error('Missing Relay conversation components');
    Object.assign(this,{repository,retriever,extractor,consolidator,relationship,inference});
    this.conversationId=repository.listConversations(1)[0]?.id||repository.beginConversation();
  }
  startConversation(context=''){
    this.conversationId=this.repository.beginConversation(crypto.randomUUID(),context);
    return this.conversationId;
  }
  async prepare(question,{limit=10,contextBudget=5000}={}){
    const message=String(question||'').trim().slice(0,2000);
    if(!message)throw Error('Message is empty');
    const matches=await this.retriever.retrieve(message,{limit});
    const past=this.repository.messages(this.conversationId,Math.min(30,limit*2));
    const relationship=this.relationship.status();
    const memory=matches.map(x=>
      (x.type==='semantic'?'Verified fact':'Past episode')+': '+x.text.slice(0,500)
    ).join('\n').slice(0,contextBudget);
    return {conversationId:this.conversationId,question:message,matches,
      memory,history:past.map(x=>({role:x.role,content:x.content})),
      relationship:{familiarity:relationship.familiarity,interactions:relationship.interaction_count,
        sharedExperiences:relationship.shared_experience_count,
        communicationPreferences:relationship.communication_style}};
  }
  async finish(question,response,{candidateExtraction=true,consolidate=true}={}){
    const q=String(question||'').trim(),answer=String(response||'').trim();
    if(!q||!answer)return {saved:false};
    this.repository.appendTurn(this.conversationId,q,answer);
    const relationship=this.relationship.recordExchange(q);
    let proposals=[];
    if(candidateExtraction){
      proposals=await this.extractor.candidates(q,{useModel:false});
      for(const item of proposals)this.repository.saveFact(item,{autoApprove:false});
    }
    let consolidated=null;
    if(consolidate&&this.consolidator){
      try{consolidated=await this.consolidator.maybeConsolidate(this.conversationId);}
      catch(error){consolidated={error:error.message};}
    }
    return {saved:true,candidates:proposals.length,relationship,consolidated};
  }
}
module.exports={ConversationManager};
