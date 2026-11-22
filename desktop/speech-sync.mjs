// Speech timing and restrained emotion cues for Mya.
// This works with system speech-synthesis boundary events, not audio waveforms.
// Phoneme-to-word approximations are a fallback and are NOT accurate lip sync.
const VISEMES = Object.freeze(['rest', 'open', 'wide', 'round', 'closed']);

export function wordViseme(word) {
  const normalized = String(word ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!normalized) return 'rest';
  if (/^[bmp]/.test(normalized)) return 'closed';
  if (/^[ou]/.test(normalized)) return 'round';
  if (/^[eiy]/.test(normalized)) return 'wide';
  if (/[ou]/.test(normalized)) return 'round';
  if (/[a]/.test(normalized)) return 'open';
  if (/[ei]/.test(normalized)) return 'wide';
  return 'open';
}
export function visemeStrength(viseme) {
  return ({ rest: 0, open: 0.90, wide: 0.57, round: 0.68, closed: 0.03 })[viseme] ?? 0;
}
export function speechEmotion(text) {
  const value = String(text ?? '').slice(0, 1500);
  if (/\b(hooray|amazing|congratulations|you did it|we won|great job|yay)\b/i.test(value)) return 'happy';
  if (/\b(sorry|worried|careful|oh no|that hurts)\b/i.test(value)) return 'concerned';
  if (/\b(wow|seriously|no way|what\?!|unexpected)\b/i.test(value)) return 'surprised';
  if (/\b(lol|haha|hehe|that's funny)\b/i.test(value)) return 'playful';
  if (/\b(interesting|let me think|perhaps|I wonder)\b/i.test(value)) return 'curious';
  return 'neutral';
}
export function boundaryWord(text, charIndex) {
  const source = String(text ?? '');
  const index = Math.max(0, Math.min(source.length, Number(charIndex) || 0));
  return source.slice(index).match(/^[^\p{L}]*([\p{L}]+)/u)?.[1] || '';
}

export class SpeechSync {
  constructor({ onStart = () => {}, onBoundary = () => {}, onEnd = () => {}, onError = () => {} } = {}) {
    this.onStart = onStart;
    this.onBoundary = onBoundary;
    this.onEnd = onEnd;
    this.onError = onError;
    this.sequence = 0;
    this.active = false;
    this.utterance = null;
  }
  cancel() {
    this.sequence++;
    const wasActive = this.active;
    this.active = false;
    this.utterance = null;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    if (wasActive) this.onEnd();
  }
  speak(text, { enabled = true, rate = 1, pitch = 1.12 } = {}) {
    this.cancel();
    const source = String(text ?? '').trim().slice(0, 1600);
    if (!enabled || !source) return false;
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
      this.onError('System speech synthesis is unavailable');
      return false;
    }
    const sequence = ++this.sequence;
    const utterance = new SpeechSynthesisUtterance(source);
    this.utterance = utterance;
    utterance.rate = Math.min(1.5, Math.max(0.75, Number(rate) || 1));
    utterance.pitch = Math.min(1.6, Math.max(0.8, Number(pitch) || 1.12));
    const done = () => {
      if (sequence !== this.sequence) return;
      const wasActive = this.active;
      this.active = false;
      this.utterance = null;
      if (wasActive) this.onEnd();
    };
    utterance.onstart = () => {
      if (sequence !== this.sequence) return;
      this.active = true;
      this.onStart({ emotion: speechEmotion(source), text: source });
    };
    utterance.onboundary = event => {
      if (sequence !== this.sequence || !this.active) return;
      const word = boundaryWord(source, event.charIndex);
      const viseme = wordViseme(word);
      if (VISEMES.includes(viseme))
        this.onBoundary({ word, viseme, strength: visemeStrength(viseme) });
    };
    utterance.onend = done;
    utterance.onerror = event => {
      if (sequence !== this.sequence) return;
      if (event.error && event.error !== 'interrupted' && event.error !== 'canceled')
        this.onError('Speech synthesis: ' + event.error);
      done();
    };
    speechSynthesis.speak(utterance);
    return true;
  }
}
