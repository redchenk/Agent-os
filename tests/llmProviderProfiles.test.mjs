import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeAgentLlmProvider,
  switchAgentLlmProvider
} from '../src/services/llmProviderProfiles.js';

test('switches model API defaults with the selected provider', () => {
  const next = switchAgentLlmProvider({
    llmProvider: 'openai',
    llmApiUrl: 'https://api.openai.com/v1/chat/completions',
    llmApiKey: 'openai-key',
    llmModel: 'gpt-4.1-mini'
  }, 'deepseek');

  assert.equal(next.llmProvider, 'deepseek');
  assert.equal(next.llmApiUrl, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(next.llmApiKey, '');
  assert.equal(next.llmModel, 'deepseek-chat');
  assert.deepEqual(next.llmProviderProfiles.openai, {
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    apiKey: 'openai-key',
    model: 'gpt-4.1-mini'
  });
});

test('restores the last private configuration for each provider', () => {
  const deepseek = switchAgentLlmProvider({
    llmProvider: 'openai',
    llmApiUrl: 'https://openai-proxy.example/v1/chat/completions',
    llmApiKey: 'openai-private',
    llmModel: 'gpt-4.1-mini'
  }, 'deepseek');
  deepseek.llmApiUrl = 'https://deepseek-proxy.example/v1/chat/completions';
  deepseek.llmApiKey = 'deepseek-private';
  deepseek.llmModel = 'deepseek-reasoner';

  const restoredOpenAI = switchAgentLlmProvider(deepseek, 'openai');
  assert.equal(restoredOpenAI.llmApiUrl, 'https://openai-proxy.example/v1/chat/completions');
  assert.equal(restoredOpenAI.llmApiKey, 'openai-private');
  assert.equal(restoredOpenAI.llmModel, 'gpt-4.1-mini');

  const restoredDeepSeek = switchAgentLlmProvider(restoredOpenAI, 'deepseek');
  assert.equal(restoredDeepSeek.llmApiUrl, 'https://deepseek-proxy.example/v1/chat/completions');
  assert.equal(restoredDeepSeek.llmApiKey, 'deepseek-private');
  assert.equal(restoredDeepSeek.llmModel, 'deepseek-reasoner');
});

test('normalizes provider aliases and unknown providers', () => {
  assert.equal(normalizeAgentLlmProvider('kimi'), 'moonshot');
  assert.equal(normalizeAgentLlmProvider('silicon-flow'), 'siliconflow');
  assert.equal(normalizeAgentLlmProvider('unknown-provider'), 'custom');
});
