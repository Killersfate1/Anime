'use strict';
// Operational rapport metrics, not a simulation of feelings or attachment.
class RelationshipStateManager {
  constructor(repository){this.repository=repository;}
  recordExchange(userMessage,{sharedExperience=false}={}){
    const text=String(userMessage||'');
    const experience=sharedExperience||/\b(?:we played|we finished|we won|remember when we|our game session)\b/i.test(text);
    return this.repository.updateRelationship({interactions:1,experiences:experience?1:0});
  }
  status(){return this.repository.relationship();}
  preferences(patch){return this.repository.updateRelationship({communicationStyle:patch});}
}
module.exports={RelationshipStateManager};
