import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  connectMailAccount,
  listInbox,
  listMailAccounts,
  sendMailMessage
} from '../src/services/mailClient.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('mail client reads the aggregated inbox with authenticated no-store requests', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return jsonResponse({ success: true, data: [{ id: 'account:7', uid: 7 }], errors: [], hasMore: false });
  };

  const result = await listInbox({ accountId: 'account', limit: 20 });
  assert.equal(result.messages[0].uid, 7);
  assert.match(captured.url, /^\/api\/mail\/inbox\?/);
  assert.match(captured.url, /accountId=account/);
  assert.equal(captured.options.credentials, 'include');
  assert.equal(captured.options.cache, 'no-store');
});

test('mail writes include trusted browser request headers', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ success: true, data: { id: 'mail-account' } }, options.method === 'POST' ? 201 : 200);
  };

  await connectMailAccount({ provider: 'qq', email: 'owner@qq.com', credential: 'secret' });
  await sendMailMessage('mail-account', { to: ['to@example.test'], body: 'hello' });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.options.headers['X-Requested-With'], 'XMLHttpRequest');
    assert.equal(call.options.headers['Content-Type'], 'application/json');
  }
});

test('mail client surfaces safe server errors', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => jsonResponse({ success: false, message: '璇峰厛鐧诲綍', code: 'UNAUTHORIZED' }, 401);
  await assert.rejects(() => listMailAccounts(), error => error.status === 401 && error.code === 'UNAUTHORIZED');
});

test('pet tools can prepare but cannot directly send mail', () => {
  const appSource = fs.readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
  assert.match(appSource, /name: 'app\.mail\.compose'/);
  assert.doesNotMatch(appSource, /name: 'app\.mail\.send'/);
  assert.match(appSource, /<MailPanel ref="mailPanelRef"/);
});

