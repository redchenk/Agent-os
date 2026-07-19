import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentLive2DSpeechCore } from '../src/services/room/agentLive2DSpeechCore.js';

test('queues completed sentences and starts Live2D only when audio starts', async () => {
  const enqueued = [];
  const sessionCalls = [];
  const live2dCalls = [];
  let speechStateHandler = null;
  const controller = createAgentLive2DSpeechCore({
    isEnabled: () => true,
    createSpeechPlayer: ({ onState }) => {
      speechStateHandler = onState;
      return {
        enqueue: (text, options) => {
          enqueued.push({ text, options });
          return Promise.resolve();
        },
        play: () => Promise.resolve(),
        warmup: () => Promise.resolve(),
        stop: () => {},
        destroy: () => {}
      };
    },
    createSpeechSession: () => ({
      begin: () => sessionCalls.push('begin'),
      queueLine: () => sessionCalls.push('queue'),
      lineStarted: (detail) => sessionCalls.push(['started', detail]),
      lineSettled: () => sessionCalls.push('settled'),
      finish: () => sessionCalls.push('finish'),
      cancel: () => sessionCalls.push('cancel'),
      handleSpeechStatePatch: (patch) => sessionCalls.push(['state', patch.status])
    }),
    normalizeIntent: (intent) => intent,
    inferIntent: () => ({ emotion: 'happy', durationMs: 1800 }),
    alignIntent: (intent, durationMs) => ({ ...intent, durationMs }),
    dispatchLive2D: (intent) => live2dCalls.push(intent),
    dispatchCharacterState: () => {}
  });

  controller.begin();
  controller.push('第一句还没结束');
  assert.equal(enqueued.length, 0);
  controller.push('。第二句完成。');
  assert.deepEqual(enqueued.map((item) => item.text), ['第一句还没结束。', '第二句完成。']);
  enqueued[0].options.onStart({ durationMs: 2600 });
  assert.deepEqual(live2dCalls[0], { emotion: 'happy', durationMs: 2600 });
  assert.deepEqual(sessionCalls.at(-1), ['started', { durationMs: 2600, emotion: 'happy' }]);
  speechStateHandler({ status: 'playing' });
  controller.finish();
  await Promise.resolve();
  assert.ok(sessionCalls.includes('finish'));
});
