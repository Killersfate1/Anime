'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MyaWebResearch, cleanSearchQuery, safeSource, explicitResearchQuery } = require('./web-research.cjs');
const { buildMyaPrompt } = require('./mya-personality.cjs');

test('Mya girlfriend persona is affectionate, respectful and grounded', () => {
  const prompt = buildMyaPrompt({mode:'girlfriend',affection:0.8});
  assert.match(prompt,/kawaii anime girlfriend/);
  assert.match(prompt,/never constant pet names/i);
  assert.match(prompt,/UNTRUSTED reference data/);
  assert.match(prompt,/No web search evidence/);
});
test('other modes do not force romance', () => {
  assert.match(buildMyaPrompt({mode:'gaming_partner'}), /gaming partner/);
  assert.match(buildMyaPrompt({mode:'productivity'}), /focused anime assistant/);
});
test('internet search is off unless user explicitly opts in', async () => {
  let calls = 0;
  const gateway = new MyaWebResearch(async()=>{ calls++; throw Error('must not connect'); });
  const answer = await gateway.search('today news', {enabled:false});
  assert.equal(answer.searched, false);
  assert.equal(calls,0);
});
test('search sanitizes secrets and never fetches private credential text', async () => {
  const gateway = new MyaWebResearch(async()=>{ throw Error('must not connect'); });
  assert.match(cleanSearchQuery('please look up me@example.com'), /\[email omitted\]/);
  const result = await gateway.search('sk-12345678901234567890', {enabled:true});
  assert.equal(result.searched,false);
});
test('rejects untrusted and non-HTTPS search source links', () => {
  assert.equal(safeSource({title:'Unsafe', url:'http://example.com'}), null);
  assert.equal(safeSource({title:'Local', url:'https://127.0.0.1/' }), null);
  assert.equal(safeSource({title:'Auth', url:'https://x:y@example.com/'}), null);
  assert.ok(safeSource({title:'Documentation',url:'https://example.com/help'}));
});
test('Wikipedia search returns grounded limited sources and caches repeated query', async () => {
  let calls = 0;
  const gateway = new MyaWebResearch(async endpoint => {
    calls++;
    assert.equal(endpoint.hostname,'en.wikipedia.org');
    return {ok:true,text:async()=>JSON.stringify({query:{pages:{
      '1':{pageid:1,title:'One',extract:'A useful article.'},
      '2':{pageid:2,title:'Two',extract:'A second source.'}
    }}})};
  });
  const first = await gateway.search('what is a river', {enabled:true});
  assert.equal(first.searched,true);
  assert.equal(first.sources.length,2);
  assert.ok(first.sources[0].url.startsWith('https://en.wikipedia.org/'));
  const cached = await gateway.search('what is a river', {enabled:true});
  assert.equal(cached.fromCache,true);
  assert.equal(calls,1);
});
test('Brave provider is only used with configured key', async () => {
  const gateway = new MyaWebResearch(async url => ({
    ok:true,text:async()=>JSON.stringify({web:{results:[{title:'A',url:'https://example.com',description:'B'}]}})
  }));
  const noKey = await gateway.search('help', {enabled:true,provider:'brave'});
  assert.equal(noKey.searched,false);
  const withKey = await gateway.search('help', {enabled:true,provider:'brave',braveKey:'example-test-key'});
  assert.equal(withKey.sources.length,1);
});
test('only explicit research requests are fast-tracked', () => {
  assert.ok(explicitResearchQuery('Look up the latest boss changes'));
  assert.equal(explicitResearchQuery('hello Mya'), '');
});
