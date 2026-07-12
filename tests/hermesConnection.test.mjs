import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LOCAL_HERMES_DESKTOP_PROXY_URL,
  resolveHermesConnectionUrl
} from '../src/services/hermesSocket.js';

test('routes Hermes Desktop aliases through the local connector', async () => {
  assert.equal(await resolveHermesConnectionUrl('desktop'), LOCAL_HERMES_DESKTOP_PROXY_URL);
  assert.equal(await resolveHermesConnectionUrl('auto'), LOCAL_HERMES_DESKTOP_PROXY_URL);
  assert.equal(
    await resolveHermesConnectionUrl('wss://127.0.0.1/runtime/hermes'),
    LOCAL_HERMES_DESKTOP_PROXY_URL
  );
});

test('passes an explicit local Hermes HTTP endpoint to the connector', async () => {
  const resolved = new URL(await resolveHermesConnectionUrl('http://127.0.0.1:64618'));
  assert.equal(`${resolved.protocol}//${resolved.host}${resolved.pathname}`, LOCAL_HERMES_DESKTOP_PROXY_URL);
  assert.equal(resolved.searchParams.get('desktopUrl'), 'http://127.0.0.1:64618/');
});

test('keeps remote WebSocket endpoints unchanged', async () => {
  const cloudUrl = 'wss://yachiyo.hk/agent-os/runtime/hermes';
  assert.equal(await resolveHermesConnectionUrl(cloudUrl), cloudUrl);
});
