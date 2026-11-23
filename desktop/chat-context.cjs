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
  messages(nextQuestion, charBudget = 9500) {
    const next = String(nextQuestion || '').trim().slice(0, 2000);
    if (!next) throw new Error('Question must be nonempty');
    // GGUF contexts are finite: keep complete recent user/assistant pairs
    // rather than overflowing the inference context with old messages.
    let available = Math.max(0, Math.min(20000, Number(charBudget) || 9500) - next.length);
    const selected = [];
    for (let i = this.turns.length - 2; i >= 0; i -= 2) {
      const pair = [this.turns[i], this.turns[i + 1]];
      const used = pair[0].content.length + pair[1].content.length;
      if (used > available) break;
      available -= used;
      selected.unshift(...pair.map(item => ({ ...item })));
    }
    return [...selected, { role: 'user', content: next }];
  }
  clear() { this.turns = []; }
  count() { return this.turns.length / 2; }
}
module.exports = { ChatContext };
