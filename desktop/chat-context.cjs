'use strict';

// Session-scoped conversation context: never persisted automatically.
// Saved user-approved memories are handled separately by main.cjs.
class ChatContext {
  constructor(maxTurns = 12) {
    this.maxTurns = Math.min(24, Math.max(1, Math.trunc(maxTurns)));
    this.turns = [];
  }
  add(question, answer) {
    const user = String(question || '').trim().slice(0, 2000);
    const assistant = String(answer || '').trim().slice(0, 4000);
    if (!user || !assistant) return;
    this.turns.push({ role: 'user', content: user });
    this.turns.push({ role: 'assistant', content: assistant });
    this.turns = this.turns.slice(-this.maxTurns * 2);
  }
  messages(nextQuestion) {
    const next = String(nextQuestion || '').trim().slice(0, 2000);
    if (!next) throw new Error('Question must be nonempty');
    // Copy so the caller cannot mutate session history.
    return [...this.turns.map(entry => ({ ...entry })), { role: 'user', content: next }];
  }
  clear() { this.turns = []; }
  count() { return this.turns.length / 2; }
}
module.exports = { ChatContext };
