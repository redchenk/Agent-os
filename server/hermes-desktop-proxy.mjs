import { execFile } from 'node:child_process';
import os from 'node:os';
import { WebSocket } from 'ws';

export const HERMES_DESKTOP_PROXY_PATH = '/hermes-desktop/api/ws';

const HERMES_DESKTOP_KNOWN_URLS = [
  'http://127.0.0.1:56854',
  'http://127.0.0.1:65356'
];
const TOKEN_RE = /window\.__HERMES_SESSION_TOKEN__\s*=\s*("(?:\\.|[^"\\])*")/;
const BASE_PATH_RE = /window\.__HERMES_BASE_PATH__\s*=\s*("(?:\\.|[^"\\])*")/;
const PROBE_TIMEOUT_MS = 450;
const PROBE_CONCURRENCY = 24;
const MAX_BUFFERED_BYTES = 1024 * 1024;

let cachedDesktopBaseUrl = '';

function parseInjectedJsonString(html, pattern) {
  const match = pattern.exec(String(html || ''));
  if (!match) return '';
  try {
    return JSON.parse(match[1]);
  } catch (_) {
    return '';
  }
}

function normalizeHttpBaseUrl(value) {
  const parsed = new URL(String(value || '').trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Hermes Desktop URL must use HTTP or HTTPS');
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname.toLowerCase())) {
    throw new Error('Hermes Desktop URL must use a loopback host');
  }
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed;
}

export function buildHermesDesktopWsUrl(baseUrl, credentialKey, credential, basePath = '') {
  const parsed = normalizeHttpBaseUrl(baseUrl);
  const prefix = String(basePath || parsed.pathname || '').replace(/\/+$/, '');
  const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = new URL(`${prefix}/api/ws`, `${protocol}//${parsed.host}`);
  wsUrl.searchParams.set(credentialKey, credential);
  return wsUrl.toString();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = PROBE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function resolveCandidate(rawUrl, timeoutMs = PROBE_TIMEOUT_MS) {
  const baseUrl = normalizeHttpBaseUrl(rawUrl);
  const response = await fetchWithTimeout(baseUrl.toString(), {
    cache: 'no-store',
    redirect: 'follow'
  }, timeoutMs);
  if (!response.ok) throw new Error(`Hermes Desktop HTTP check failed (${response.status})`);

  const html = await response.text();
  if (!/__HERMES_(?:SESSION_TOKEN|BASE_PATH)__|<title>Hermes<\/title>/i.test(html)) {
    throw new Error('Not a Hermes Desktop endpoint');
  }

  const basePath = parseInjectedJsonString(html, BASE_PATH_RE);
  const token = parseInjectedJsonString(html, TOKEN_RE);
  if (token) {
    cachedDesktopBaseUrl = baseUrl.toString();
    return buildHermesDesktopWsUrl(baseUrl, 'token', token, basePath);
  }

  const prefix = String(basePath || baseUrl.pathname || '').replace(/\/+$/, '');
  const ticketUrl = new URL(`${prefix}/api/auth/ws-ticket`, baseUrl.origin);
  const cookie = response.headers.get('set-cookie') || '';
  const ticketResponse = await fetchWithTimeout(ticketUrl, {
    method: 'POST',
    cache: 'no-store',
    headers: cookie ? { cookie } : {}
  }, Math.max(timeoutMs, 1500));
  if (!ticketResponse.ok) throw new Error(`Hermes Desktop WebSocket ticket failed (${ticketResponse.status})`);
  const payload = await ticketResponse.json().catch(() => null);
  const ticket = payload?.ticket || payload?.wsTicket || payload?.ws_ticket || payload?.token || '';
  if (!ticket) throw new Error('Hermes Desktop did not return a WebSocket ticket');
  cachedDesktopBaseUrl = baseUrl.toString();
  return buildHermesDesktopWsUrl(baseUrl, 'ticket', ticket, basePath);
}

function runCommand(file, args, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024
    }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

async function listWindowsLoopbackPorts() {
  const netstat = process.env.SystemRoot
    ? `${process.env.SystemRoot}\\System32\\netstat.exe`
    : 'netstat.exe';
  const output = await runCommand(netstat, ['-ano', '-p', 'tcp']);
  const ports = [];
  for (const line of output.split(/\r?\n/)) {
    if (!/\bLISTENING\b/i.test(line)) continue;
    const match = /^\s*TCP\s+(?:127\.0\.0\.1|\[?::1\]?):(\d+)\s/i.exec(line);
    if (match) ports.push(Number(match[1]));
  }
  return [...new Set(ports)];
}

async function listUnixLoopbackPorts() {
  const output = await runCommand('sh', ['-lc', "ss -ltnH 2>/dev/null || netstat -ltn 2>/dev/null || true"]);
  const ports = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /(?:127\.0\.0\.1|\[?::1\]?):(\d+)\b/.exec(line);
    if (match) ports.push(Number(match[1]));
  }
  return ports;
}

export async function listLoopbackListeningPorts() {
  try {
    return process.platform === 'win32'
      ? await listWindowsLoopbackPorts()
      : await listUnixLoopbackPorts();
  } catch (_) {
    return [];
  }
}

function uniqueCandidateUrls(preferredUrls = [], ports = []) {
  const values = [
    ...preferredUrls,
    process.env.HERMES_DESKTOP_URL,
    cachedDesktopBaseUrl,
    ...HERMES_DESKTOP_KNOWN_URLS,
    ...ports.sort((a, b) => b - a).map((port) => `http://127.0.0.1:${port}`)
  ];
  const seen = new Set();
  return values.filter((value) => {
    if (!value) return false;
    try {
      const normalized = normalizeHttpBaseUrl(value).toString().replace(/\/+$/, '');
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    } catch (_) {
      return false;
    }
  });
}

async function probeCandidates(urls, timeoutMs = PROBE_TIMEOUT_MS) {
  let cursor = 0;
  let resolved = '';
  const workers = Array.from({ length: Math.min(PROBE_CONCURRENCY, Math.max(urls.length, 1)) }, async () => {
    while (!resolved && cursor < urls.length) {
      const url = urls[cursor];
      cursor += 1;
      try {
        resolved = await resolveCandidate(url, timeoutMs);
      } catch (_) {
        // Keep probing local listeners until Hermes Desktop is found.
      }
    }
  });
  await Promise.all(workers);
  return resolved;
}

export async function resolveHermesDesktopConnectionUrl(options = {}) {
  const ports = options.ports || await (options.listPorts || listLoopbackListeningPorts)();
  const candidates = uniqueCandidateUrls(options.preferredUrls, ports);
  const resolved = await probeCandidates(candidates, options.timeoutMs || PROBE_TIMEOUT_MS);
  if (!resolved) {
    throw new Error('Hermes Desktop was not found. Open Hermes Desktop and keep the Agent OS local connector running.');
  }
  return resolved;
}

function closeSocket(socket, code = 1011, reason = 'Hermes Desktop proxy closed') {
  if (!socket) return;
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    try {
      socket.close(code, String(reason || '').slice(0, 120));
    } catch (_) {
      socket.terminate?.();
    }
  }
}

export async function proxyHermesDesktopSocket(client, options = {}) {
  const pending = [];
  let pendingBytes = 0;
  let upstream = null;
  let clientClosed = false;

  const onClientMessage = (data, isBinary) => {
    if (upstream?.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
      return;
    }
    const size = Buffer.byteLength(data);
    if (pendingBytes + size > MAX_BUFFERED_BYTES) {
      closeSocket(client, 1009, 'Hermes Desktop proxy buffer exceeded');
      return;
    }
    pending.push({ data, isBinary });
    pendingBytes += size;
  };

  client.on('message', onClientMessage);
  client.once('close', () => {
    clientClosed = true;
    closeSocket(upstream, 1000, 'Agent OS disconnected');
  });

  try {
    const upstreamUrl = await (options.resolveUrl || resolveHermesDesktopConnectionUrl)({
      preferredUrls: options.preferredUrls || []
    });
    if (clientClosed) return;
    upstream = new (options.WebSocketImpl || WebSocket)(upstreamUrl);

    upstream.once('open', () => {
      for (const message of pending.splice(0)) {
        upstream.send(message.data, { binary: message.isBinary });
      }
      pendingBytes = 0;
    });
    upstream.on('message', (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });
    upstream.once('error', (error) => {
      closeSocket(client, 1011, error?.message || 'Hermes Desktop connection failed');
    });
    upstream.once('close', (code, reason) => {
      closeSocket(client, code === 1000 ? 1000 : 1011, reason?.toString() || 'Hermes Desktop disconnected');
    });
  } catch (error) {
    closeSocket(client, 1011, error?.message || 'Hermes Desktop discovery failed');
  }
}
