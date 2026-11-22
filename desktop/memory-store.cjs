'use strict';
const KINDS = Object.freeze(['note', 'preference', 'project', 'shared_activity', 'conversation']);
const STOP = new Set(['the','and','what','with','from','about','this','that','have','does','did','your','can','how','for','you','are','was','were','who','when','where','my','our','their','them']);

function normalizeKind(raw) { return KINDS.includes(raw) ? raw : 'note'; }
function cleanContent(value) {
  return typeof value === 'string' ? value.trim().slice(0, 500) : '';
}
function makeMemory(raw, id, time) {
  const content = cleanContent(typeof raw === 'string' ? raw : raw?.content);
  if (!content) return null;
  return {
    id: String(id),
    kind: normalizeKind(raw?.kind),
    content,
    at: time,
    source: 'user-approved'
  };
}
function validMemories(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(m => m && typeof m === 'object' && typeof m.id === 'string' &&
    typeof m.content === 'string' && m.source === 'user-approved')
    .map(m => ({ id: m.id, kind: normalizeKind(m.kind), content: cleanContent(m.content),
      at: typeof m.at === 'string' ? m.at : '', source: 'user-approved' }))
    .filter(m => m.content).slice(-200);
}
function keywords(value) {
  return new Set(String(value || '').toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(word => !STOP.has(word)) || []);
}
function relevantMemories(memories, question, maxItems = 12) {
  const entries = validMemories(memories);
  const terms = keywords(question);
  const scored = entries.map((memory, idx) => {
    const words = keywords(memory.content);
    let matches = 0;
    for (const token of terms) if (words.has(token)) matches++;
    return { memory, idx, score: matches };
  });
  scored.sort((a,b) => b.score - a.score || b.idx - a.idx);
  return scored.slice(0, Math.min(16, Math.max(1, maxItems)))
    .map(({ memory }) => memory);
}
module.exports = { KINDS, makeMemory, validMemories, relevantMemories };
