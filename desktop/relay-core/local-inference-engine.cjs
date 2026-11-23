'use strict';
// Owned, app-launched llama.cpp inference component. Runs in the Electron main
// process and never depends on Ollama or cloud inference. An inference child
// process is not the Unity renderer: only typed messages cross that boundary.
const {MyaLocalEngine}=require('../local-engine.cjs');
class LocalInferenceEngine extends MyaLocalEngine {
  constructor(options={}) { super(options); }
  async generate(messages,options={}) { return this.complete(messages,options); }
}
module.exports={LocalInferenceEngine};
