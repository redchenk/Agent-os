import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAudioPriming,
  primeAudioForAsyncPlayback
} from '../src/services/musicPlaybackGesture.js';

function fakeAudio(overrides = {}) {
  const attributes = new Map();
  return {
    paused: true,
    currentSrc: '',
    loop: false,
    src: '',
    playCalls: 0,
    pauseCalls: 0,
    loadCalls: 0,
    getAttribute(name) {
      return attributes.get(name) || '';
    },
    removeAttribute(name) {
      attributes.delete(name);
      if (name === 'src') this.src = '';
    },
    play() {
      this.playCalls += 1;
      return Promise.resolve();
    },
    pause() {
      this.pauseCalls += 1;
      this.paused = true;
    },
    load() {
      this.loadCalls += 1;
    },
    ...overrides
  };
}

test('primes an empty audio element synchronously and releases it', async () => {
  const audio = fakeAudio();
  const priming = primeAudioForAsyncPlayback(audio);

  assert.ok(priming);
  assert.equal(audio.playCalls, 1);
  assert.equal(audio.loop, true);
  assert.match(audio.src, /^data:audio\/wav;base64,/);
  assert.equal(isAudioPriming(audio), true);

  await priming.ready;
  priming.release();
  assert.equal(audio.pauseCalls, 1);
  assert.equal(audio.loop, false);
  assert.equal(isAudioPriming(audio), false);
});

test('does not interrupt an audio element that already has a source', () => {
  const audio = fakeAudio({ currentSrc: 'https://example.com/song.mp3' });

  assert.equal(primeAudioForAsyncPlayback(audio), null);
  assert.equal(audio.playCalls, 0);
});

test('clears the silent source when track resolution fails', () => {
  const audio = fakeAudio();
  const priming = primeAudioForAsyncPlayback(audio);

  priming.release({ clearSource: true });
  assert.equal(audio.src, '');
  assert.equal(audio.loadCalls, 1);
  assert.equal(isAudioPriming(audio), false);
});
