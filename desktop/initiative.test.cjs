'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { InitiativeGate } = require('./initiative.cjs');

const event = {
  event: 'victory',
  confidence: 0.95,
  significance: 0.96,
  proposedComment: 'That was a great finish!'
};

test('requires repeated independent observations', () => {
  const gate = new InitiativeGate();
  assert.equal(gate.consider(event, { now: 1000, talkativeness: 0.5 }).shouldSpeak, false);
  assert.equal(gate.consider(event, { now: 17000, talkativeness: 0.5 }).shouldSpeak, true);
});
test('cooldown stops repetitive commentary', () => {
  const gate = new InitiativeGate({ cooldownMs: 60000 });
  gate.consider(event, { now: 0, talkativeness: 0.8 });
  gate.consider(event, { now: 16000, talkativeness: 0.8 });
  assert.equal(gate.consider(event, { now: 32000, talkativeness: 0.8 }).shouldSpeak, false);
  assert.equal(gate.consider(event, { now: 80001, talkativeness: 0.8 }).shouldSpeak, true);
});
test('quiet and concentration modes suppress commentary', () => {
  const gate = new InitiativeGate();
  gate.consider(event, { now: 0, talkativeness: 1 });
  assert.equal(gate.consider(event, { now: 16000, talkativeness: 1, quietMode: true }).shouldSpeak, false);
  assert.equal(gate.consider(event, { now: 32000, talkativeness: 1, userConcentrating: true }).shouldSpeak, false);
});
test('unknown events, low confidence and no commentary do not pass', () => {
  const gate = new InitiativeGate();
  assert.equal(gate.consider({ ...event, event: 'run_shell_command' }, { now: 0 }).shouldSpeak, false);
  assert.equal(gate.consider({ ...event, confidence: 0.2 }, { now: 16000 }).shouldSpeak, false);
  assert.equal(gate.consider({ ...event, confidence: 0.2 }, { now: 32000 }).shouldSpeak, false);
  assert.equal(gate.consider({ ...event, proposedComment: '' }, { now: 48000 }).shouldSpeak, false);
});
test('stopping monitoring resets the event sequence', () => {
  const gate = new InitiativeGate();
  gate.consider(event, { now: 0, talkativeness: 1 });
  gate.reset();
  assert.equal(gate.consider(event, { now: 16000, talkativeness: 1 }).shouldSpeak, false);
});
