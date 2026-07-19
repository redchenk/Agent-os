import assert from 'node:assert/strict';
import test from 'node:test';

import { createLive2DStreamingSpeechSession } from '../src/services/room/live2dStreamingSpeechSession.js';

test('keeps Live2D speaking across temporary sentence gaps until the stream finishes', () => {
  const states = [];
  const timers = [];
  const session = createLive2DStreamingSpeechSession({
    dispatchCharacterState: (mode, detail) => states.push({ mode, detail }),
    setTimer: (callback, delayMs) => {
      timers.push({ callback, delayMs });
      return timers.length;
    },
    clearTimer: () => {}
  });
  session.begin();
  session.queueLine();
  session.lineStarted({ durationMs: 2200, emotion: 'happy' });
  session.lineSettled();
  assert.equal(timers.length, 0);
  session.finish();
  assert.equal(timers.length, 1);
  timers[0].callback();
  assert.equal(states.at(-1).mode, 'idle');
});
