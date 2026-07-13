import assert from 'node:assert/strict';
import test from 'node:test';

import { callPetModel } from '../src/services/agentOsPetModel.js';

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
