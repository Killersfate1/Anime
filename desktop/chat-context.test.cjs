'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ChatContext } = require('./chat-context.cjs');

test('provides previous messages as context without persisting anything', () => {
  const ctx = new ChatContext(2);
  ctx.add('What game is this?', 'The title is not visible to me yet.');
  assert.deepEqual(ctx.messages('Any ideas?'), [
    { role: 'user', content: 'What game is this?' },
    { role: 'assistant', content: 'The title is not visible to me yet.' },
    { role: 'user', content: 'Any ideas?' }
  ]);
});
test('trims older dialogue at configured turn limit', () => {
  const ctx = new ChatContext(2);
  ctx.add('one', 'one');
  ctx.add('two', 'two');
  ctx.add('three', 'three');
  assert.equal(ctx.count(), 2);
  assert.equal(ctx.messages('four')[0].content, 'two');
});
test('clear removes all session context', () => {
  const ctx = new ChatContext();
  ctx.add('hi', 'hello');
  ctx.clear();
  assert.equal(ctx.count(), 0);
  assert.deepEqual(ctx.messages('new'), [{ role: 'user', content: 'new' }]);
});

test('respects local GGUF context budgets while retaining recent complete exchanges', () => {
  const ctx = new ChatContext(20);
  ctx.add('Old question about a sprawling topic', 'An old and relatively long reply');
  ctx.add('new', 'fresh reply');
  const limited = ctx.messages('follow-up', 34);
  assert.deepEqual(limited, [{ role: 'user', content: 'new' },
    { role: 'assistant', content: 'fresh reply' },
    { role: 'user', content: 'follow-up' }]);
});
