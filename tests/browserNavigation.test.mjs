import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAgentOsSearchUrl,
  normalizeBrowserSearchQuery
} from '../src/services/browserNavigation.js';
import { normalizePetModelAction } from '../src/services/agentOsPetModel.js';

test('unwraps an Agent OS search route into the original query', () => {
  const route = 'agentos://search?q=%E7%B3%96%E5%B0%BF%E7%97%85%E6%B2%BB%E7%96%97';
  assert.equal(normalizeBrowserSearchQuery(route), '糖尿病治疗');
});

test('unwraps repeatedly nested Agent OS search routes', () => {
  const original = 'AI 最新进展';
  const nested = buildAgentOsSearchUrl(buildAgentOsSearchUrl(original));
  assert.equal(normalizeBrowserSearchQuery(nested), original);
  assert.equal(buildAgentOsSearchUrl(nested), buildAgentOsSearchUrl(original));
});

test('converts a model-generated internal browser URL into a search action', () => {
  const action = normalizePetModelAction({
    name: 'app.browser.open',
    args: { url: 'agentos://search?q=%E7%B3%96%E5%B0%BF%E7%97%85%E6%B2%BB%E7%96%97' }
  });
  assert.deepEqual(action, {
    name: 'app.browser.search',
    args: { query: '糖尿病治疗' }
  });
});

test('normalizes a routed query passed directly to browser search', () => {
  const action = normalizePetModelAction({
    name: 'app.browser.search',
    args: { query: 'agentos://search?q=AI%20latest' }
  });
  assert.equal(action.args.query, 'AI latest');
});
