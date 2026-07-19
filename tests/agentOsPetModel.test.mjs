import assert from 'node:assert/strict';
import test from 'node:test';

import {
  callPetModel,
  callPetModelStream,
  normalizePetModelAction,
  readStreamingJsonObjectField,
  readStreamingJsonStringField
} from '../src/services/agentOsPetModel.js';

test('repairs a one-character browser query truncated from an explicit search request', () => {
  const action = normalizePetModelAction({
    name: 'app.browser.search',
    args: { query: '松' }
  }, { input: '搜松饼的做法' });

  assert.equal(action.args.query, '松饼的做法');
});

test('keeps complete or intentionally single-character browser queries unchanged', () => {
  assert.equal(normalizePetModelAction({
    name: 'app.browser.search',
    args: { query: '松饼 做法' }
  }, { input: '帮我搜索松饼的做法' }).args.query, '松饼 做法');

  assert.equal(normalizePetModelAction({
    name: 'app.browser.search',
    args: { query: '松' }
  }, { input: '搜松' }).args.query, '松');
});

test('repairs a truncated browser query at the model response boundary', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      reply: '我来搜索。',
      actions: [{ name: 'app.browser.search', args: { query: '松' } }]
    }) } }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  try {
    const result = await callPetModel({
      settings: {
        llmApiUrl: 'https://api.example.test/v1/chat/completions',
        llmApiKey: 'test-key',
        llmModel: 'test-model'
      },
      input: '搜松饼的做法',
      tools: [{ name: 'app.browser.search' }],
      state: {}
    });

    assert.equal(result.actions[0].args.query, '松饼的做法');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reads a stable partial reply from streamed JSON', () => {
  assert.deepEqual(readStreamingJsonStringField('{"reply":"你好\\n世界'), {
    value: '你好\n世界',
    complete: false
  });
});

test('reads a complete Live2D intent before the reply body is complete', () => {
  assert.deepEqual(readStreamingJsonObjectField(
    '{"live2d":{"emotion":"happy","actions":["nod"]},"reply":"第一句'
  ), {
    value: { emotion: 'happy', actions: ['nod'] },
    complete: true
  });
});

test('streams reply text before the final structured pet result', async () => {
  const originalFetch = globalThis.fetch;
  const replyDeltas = [];
  const live2dIntents = [];
  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    const encoder = new TextEncoder();
    const fragments = [
      '{"live2d":{"emotion":"happy"},"reply":"第一句',
      '完成。第二句',
      '完成。","actions":[]}'
    ];
    const stream = new ReadableStream({
      start(controller) {
        fragments.forEach((content) => controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
        )));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    });
    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    });
  };

  try {
    const result = await callPetModelStream({
      settings: {
        llmApiUrl: 'https://api.example.test/v1/chat/completions',
        llmApiKey: 'test-key',
        llmModel: 'test-model'
      },
      input: '测试流式桌宠',
      tools: [],
      state: {},
      onReplyDelta: (delta) => replyDeltas.push(delta),
      onLive2D: (intent) => live2dIntents.push(intent)
    });

    assert.equal(requestBody.stream, true);
    assert.equal(replyDeltas.join(''), '第一句完成。第二句完成。');
    assert.equal(result.reply, '第一句完成。第二句完成。');
    assert.equal(result.live2d.emotion, 'happy');
    assert.deepEqual(live2dIntents, [{ emotion: 'happy' }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('feeds completed app action results back to the model for a grounded reply', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"reply":"已根据搜索结果整理。","actions":[]}' } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const result = await callPetModel({
      settings: {
        llmApiUrl: 'https://api.example.test/v1/chat/completions',
        llmApiKey: 'test-key',
        llmModel: 'test-model'
      },
      input: '搜索 AI 最新进展',
      tools: [{ name: 'app.browser.search' }],
      state: {},
      previousResponse: {
        reply: '我来搜索。',
        actions: [{ name: 'app.browser.search', args: { query: 'AI 最新进展' } }]
      },
      actionResults: [{
        status: 'done',
        name: 'app.browser.search',
        summary: '{"results":[{"title":"真实搜索结果","url":"https://example.test/result"}]}'
      }]
    });

    assert.equal(result.reply, '已根据搜索结果整理。');
    assert.equal(requestBody.messages.length, 4);
    assert.match(requestBody.messages[3].content, /真实搜索结果/);
    assert.match(requestBody.messages[3].content, /不要再次调用已经完成的动作/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

