'use strict';
function cosine(a,b){
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length||!a.length)return 0;
  let dot=0,na=0,nb=0;
  for(let i=0;i<a.length;i++){dot+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];}
  return na&&nb?dot/Math.sqrt(na*nb):0;
}
function daysSince(date){
  const t=Date.parse(date);return Number.isFinite(t)?Math.max(0,(Date.now()-t)/86400000):365;
}
class MemoryRetriever {
  constructor(repository,{embedder=null}={}){this.repository=repository;this.embedder=embedder;}
  async retrieve(query,{limit=12}={}){
    const cap=Math.max(1,Math.min(30,limit)),results=new Map();
    const score=(row,type,{lexical=0,semantic=0}={})=>{
      const text=type==='semantic'?row.content:row.summary;
      const id=type+':'+row.id;
      const recency=Math.exp(-daysSince(row.updated_at||row.event_at||row.created_at)/90);
      const base=Math.max(0,Math.min(1,Number(row.importance)||0.5));
      const rank=0.35*lexical+0.42*semantic+0.13*recency+0.10*base;
      if(!results.has(id)||rank>results.get(id).rank)
        results.set(id,{id:row.id,type,text,kind:row.kind,at:row.updated_at||row.event_at,rank,importance:base});
    };
    for(const r of this.repository.searchFacts(query,Math.max(cap*3,12)))score(r,'semantic',{lexical:Math.min(1,0.55+Math.max(0,-r.rank)*0.02)});
    for(const r of this.repository.searchEpisodes(query,Math.max(cap*2,12)))score(r,'episodic',{lexical:0.65});
    if(this.embedder?.ready) {
      try {
        const q=await this.embedder.embed(query);
        const model=this.embedder.modelId;
        for(const type of ['semantic','episodic']){
          for(const r of this.repository.vectorCandidates(type,model,2000)){
            const similarity=cosine(q,r.vector);
            if(similarity>0.35)score(r,type,{semantic:(similarity-0.3)/0.7});
          }
        }
      }catch{}
    }
    const picked=[...results.values()].sort((a,b)=>b.rank-a.rank).slice(0,cap);
    for(const item of picked)if(item.type==='semantic')this.repository.touch(item.id);
    return picked;
  }
  async indexPending(limit=10){
    if(!this.embedder?.ready)return {indexed:0,reason:'Embedding model not installed'};
    let count=0;
    for(const type of ['semantic','episodic']){
      for(const row of this.repository.unindexed(type,limit)){
        try{
          const value=type==='semantic'?row.content:row.title+' '+row.summary;
          this.repository.storeVector(type,row.id,this.embedder.modelId,await this.embedder.embed(value));
          count++;
        }catch{}
      }
    }
    return {indexed:count};
  }
}
module.exports={MemoryRetriever,cosine};
