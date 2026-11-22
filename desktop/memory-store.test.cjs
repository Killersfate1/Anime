'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeMemory, validMemories, relevantMemories } = require('./memory-store.cjs');

test('saves only user-approved text with an allowlisted category', () => {
  assert.equal(makeMemory({ content: '', kind: 'project' }, '1', 'now'), null);
  assert.equal(makeMemory({ content: '  Loves RPG games  ', kind: 'preference' }, '1', 'now').content, 'Loves RPG games');
  assert.equal(makeMemory({ content: 'hi', kind: 'system' }, '1', 'now').kind, 'note');
});
test('rejects malformed and non-approved persisted content', () => {
  assert.deepEqual(validMemories([{ id:'1', content:'secret', source:'screen' }]), []);
  assert.deepEqual(validMemories({ foo:'bar' }), []);
});
test('selects topically relevant memories rather than only newest notes', () => {
  const entries = [
    makeMemory({ content:'My game is a zombie survival RPG',kind:'project' },'1','now'),
    makeMemory({ content:'I prefer dark mode',kind:'preference' },'2','now')
  ];
  assert.equal(relevantMemories(entries, 'What about my zombie game?', 1)[0].id,'1');
});
