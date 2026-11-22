import test from 'node:test';
import assert from 'node:assert/strict';
import { boundaryWord, speechEmotion, visemeStrength, wordViseme, SpeechSync } from './speech-sync.mjs';

test('phonetic approximation exposes distinct mouth shapes', () => {
  assert.equal(wordViseme('apple'), 'open');
  assert.equal(wordViseme('oops'), 'round');
  assert.equal(wordViseme('beep'), 'closed');
  assert.equal(wordViseme('easy'), 'wide');
  assert.equal(visemeStrength('rest'), 0);
  assert.ok(visemeStrength('open') > visemeStrength('closed'));
});
test('word boundaries, emotion and unknown text are handled safely', () => {
  assert.equal(boundaryWord('Hey, amazing!', 5), 'amazing');
  assert.equal(speechEmotion('Amazing job, you did it!'), 'happy');
  assert.equal(speechEmotion('I wonder why that failed'), 'curious');
  assert.equal(speechEmotion('Ordinary dialogue'), 'neutral');
});
test('starting, boundaries, cancellation and stale speech events are coordinated', () => {
  const events = [];
  class MockUtterance {
    constructor(text) { this.text = text; }
  }
  const speech = {
    last: null,
    cancel() {},
    speak(utterance) { this.last = utterance; }
  };
  const existingSpeech = globalThis.speechSynthesis;
  const existingUtterance = globalThis.SpeechSynthesisUtterance;
  globalThis.speechSynthesis = speech;
  globalThis.SpeechSynthesisUtterance = MockUtterance;
  try {
    const sync = new SpeechSync({
      onStart: value => events.push(['start', value.emotion]),
      onBoundary: value => events.push(['boundary', value.viseme]),
      onEnd: () => events.push(['end'])
    });
    assert.equal(sync.speak('Amazing apple'), true);
    const first = speech.last;
    first.onstart();
    first.onboundary({ charIndex: 8 });
    sync.cancel();
    first.onend(); // stale event must not end an already canceled/new utterance
    assert.deepEqual(events, [['start', 'happy'], ['boundary', 'open'], ['end']]);
    assert.equal(sync.active, false);
  } finally {
    globalThis.speechSynthesis = existingSpeech;
    globalThis.SpeechSynthesisUtterance = existingUtterance;
  }
});
test('disabled output does not start audio', () => {
  assert.equal(new SpeechSync().speak('No audio', { enabled: false }), false);
});
