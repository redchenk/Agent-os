import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { WebSocket, WebSocketServer } from 'ws';

import {
  HERMES_DESKTOP_PROXY_PATH,
  proxyHermesDesktopSocket,
  resolveHermesDesktopConnectionUrl
} from '../server/hermes-desktop-proxy.mjs';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function nextMessage(socket) {
  return new Promise((resolve, reject) => {
    socket.once('message', (data) => resolve(data.toString()));
    socket.once('error', reject);
  });
}

test('discovers Hermes Desktop and relays gateway messages', async (t) => {
  const token = 'test-session-token';
  const desktopServer = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<title>Hermes</title><script>window.__HERMES_SESSION_TOKEN__=${JSON.stringify(token)};window.__HERMES_BASE_PATH__="";</script>`);
  });
  const desktopWss = new WebSocketServer({ noServer: true });
  desktopServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname !== '/api/ws' || url.searchParams.get('token') !== token) {
      socket.destroy();
      return;
    }
    desktopWss.handleUpgrade(req, socket, head, (ws) => desktopWss.emit('connection', ws, req));
  });
  desktopWss.on('connection', (socket) => {
    socket.on('message', (data, isBinary) => socket.send(data, { binary: isBinary }));
  });
  const desktopPort = await listen(desktopServer);

  const resolved = await resolveHermesDesktopConnectionUrl({
    preferredUrls: [`http://127.0.0.1:${desktopPort}`],
    ports: [],
    timeoutMs: 1000
  });
  assert.equal(resolved, `ws://127.0.0.1:${desktopPort}/api/ws?token=${token}`);

  const proxyServer = http.createServer();
  const proxyWss = new WebSocketServer({ noServer: true });
  proxyServer.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://127.0.0.1').pathname !== HERMES_DESKTOP_PROXY_PATH) {
      socket.destroy();
      return;
    }
    proxyWss.handleUpgrade(req, socket, head, (ws) => proxyWss.emit('connection', ws, req));
  });
  proxyWss.on('connection', (socket) => {
    proxyHermesDesktopSocket(socket, {
      resolveUrl: async () => resolved
    });
  });
  const proxyPort = await listen(proxyServer);

  const client = await openSocket(`ws://127.0.0.1:${proxyPort}${HERMES_DESKTOP_PROXY_PATH}`);
  t.after(() => client.close());
  const payload = JSON.stringify({ jsonrpc: '2.0', id: 'agent-os-test', method: 'session.create' });
  client.send(payload);
  assert.equal(await nextMessage(client), payload);

  await new Promise((resolve) => {
    client.once('close', resolve);
    client.close(1000, 'done');
  });
  proxyWss.close();
  desktopWss.close();
  await closeServer(proxyServer);
  await closeServer(desktopServer);
});
