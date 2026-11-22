'use strict';

// Pure, testable decision gate. Receives observations only after the user
// explicitly enables screen monitoring. It cannot capture, transmit or act.
const KNOWN_EVENTS = new Set([
  'victory', 'defeat', 'repeated_error', 'funny_moment',
  'interesting_discovery', 'unexpected_event'
]);

class InitiativeGate {
  constructor(options = {}) {
    this.cooldownMs = options.cooldownMs ?? 60000;
    this.minimumConfidence = options.minimumConfidence ?? 0.78;
    this.reset();
  }
  reset() {
    this.eventName = '';
    this.confirmations = 0;
    this.lastSpokenAt = -Infinity;
  }
  consider(input, options = {}) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const talkativeness = Math.min(1, Math.max(0, Number(options.talkativeness) || 0));
    const event = String(input?.event || '').toLowerCase();
    const confidence = Math.min(1, Math.max(0, Number(input?.confidence) || 0));
    const significance = Math.min(1, Math.max(0, Number(input?.significance) || 0));
    const score = 0.70 * significance + 0.30 * confidence;
    const threshold = 0.88 - talkativeness * 0.22;

    if (!KNOWN_EVENTS.has(event)) {
      this.eventName = '';
      this.confirmations = 0;
      return { shouldSpeak: false, reason: 'no verified event', score };
    }
    if (event === this.eventName) this.confirmations++;
    else { this.eventName = event; this.confirmations = 1; }

    const blocked = options.quietMode || options.userSpeaking || options.userConcentrating;
    const eligible = !!input.proposedComment &&
      confidence >= this.minimumConfidence &&
      score >= threshold &&
      this.confirmations >= 2 &&
      now - this.lastSpokenAt >= this.cooldownMs &&
      !blocked;
    if (eligible) {
      this.lastSpokenAt = now;
      this.confirmations = 0;
    }
    return {
      shouldSpeak: eligible,
      reason: blocked ? 'user attention protected' :
        this.confirmations < 2 && !eligible ? 'requires temporal confirmation' :
        !eligible ? 'confidence, score, or cooldown gate' : 'approved',
      score, threshold
    };
  }
}

module.exports = { InitiativeGate };
