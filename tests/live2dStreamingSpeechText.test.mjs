import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createStreamingSpeechTextBuffer,
  mergeStreamingText
} from '../src/services/room/live2dStreamingSpeechText.js';

test('emits the first complete sentence before the model stream finishes', () => {
  const buffer = createStreamingSpeechTextBuffer();
  assert.deepEqual(buffer.push('今天的状态很好'), []);
  assert.deepEqual(buffer.push('。下一句还在生成'), ['今天的状态很好。']);
  assert.deepEqual(buffer.finish('今天的状态很好。下一句还在生成。'), ['下一句还在生成。']);
});

test('accepts cumulative packets without repeating speech', () => {
  const buffer = createStreamingSpeechTextBuffer();
  buffer.push('欢迎回来');
  assert.deepEqual(buffer.push('欢迎回来。'), ['欢迎回来。']);
  assert.deepEqual(buffer.push('欢迎回来。今晚也请多关照。'), ['今晚也请多关照。']);
  assert.deepEqual(buffer.finish('欢迎回来。今晚也请多关照。'), []);
  assert.equal(mergeStreamingText('你好', '你好，世界'), '你好，世界');
});

test('does not send fenced code or URLs to speech synthesis', () => {
  const buffer = createStreamingSpeechTextBuffer();
  const chunks = [
    ...buffer.push('先检查配置。\n```js\nfetch("https://example.com");\n```\n'),
    ...buffer.finish('然后重新连接 https://example.com/status。')
  ];
  assert.deepEqual(chunks, ['先检查配置。', '然后重新连接。']);
});

test('starts a natural clause early when the model has not emitted a full stop', () => {
  const buffer = createStreamingSpeechTextBuffer();
  assert.deepEqual(
    buffer.push('This opening clause is ready, while the rest is still arriving'),
    ['This opening clause is ready,']
  );
});
