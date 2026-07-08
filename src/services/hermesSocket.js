const SOCKET_STATES = {
  idle: 'idle',
  connecting: 'connecting',
  open: 'open',
  closing: 'closing',
  closed: 'closed',
  error: 'error'
};

function safeJsonParse(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return { type: 'text', text: value };
  }
}

function createRequestId(prefix = 'req') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

const HERMES_DESKTOP_DISCOVERY_STORAGE_KEY = 'hermesAgentOsHermesDesktopUrls:v1';
const AUTO_HERMES_URLS = new Set(['auto', 'desktop', 'hermes', 'hermes-desktop']);
const HERMES_DESKTOP_KNOWN_URLS = [
  'http://127.0.0.1:56854',
  'http://127.0.0.1:65356'
];
const HERMES_DESKTOP_DISCOVERY_CONCURRENCY = 96;
const HERMES_DESKTOP_PROBE_TIMEOUT_MS = 220;

function parseInjectedJsonString(html, name) {
  const pattern = new RegExp(`window\\.${name}\\s*=\\s*("(?:\\\\.|[^"\\\\])*")`);
  const match = pattern.exec(String(html || ''));
  if (!match) return '';
  try {
    return JSON.parse(match[1]);
  } catch (_) {
    return '';
  }
}

function normalizeHttpBaseUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed;
}

function isAutoHermesUrl(value) {
  return AUTO_HERMES_URLS.has(String(value || '').trim().toLowerCase());
}

function isLoopbackHost(hostname) {
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(hostname || '').toLowerCase());
}

function normalizeDiscoveryBaseUrl(rawUrl) {
  const parsed = normalizeHttpBaseUrl(rawUrl);
  if (!/^https?:$/i.test(parsed.protocol)) return '';
  return parsed.toString().replace(/\/+$/, '');
}

function readCachedHermesDesktopUrls() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(HERMES_DESKTOP_DISCOVERY_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch (_) {
    return [];
  }
}

function rememberHermesDesktopBaseUrl(baseUrl) {
  try {
    const normalized = normalizeDiscoveryBaseUrl(baseUrl);
    if (!normalized) return;
    const next = [
      normalized,
      ...readCachedHermesDesktopUrls().filter((item) => normalizeDiscoveryBaseUrl(item) !== normalized)
    ].slice(0, 8);
    globalThis.localStorage?.setItem(HERMES_DESKTOP_DISCOVERY_STORAGE_KEY, JSON.stringify(next));
  } catch (_) {
    // localStorage may be unavailable in private or non-browser runtimes.
  }
}

function looksLikeHermesDesktopHtml(html) {
  const sample = String(html || '').slice(0, 30000);
  return /__HERMES_(?:SESSION_TOKEN|BASE_PATH)__|Hermes/i.test(sample);
}

function uniqueHermesCandidateUrls(preferredUrls = []) {
  const seen = new Set();
  const urls = [];
  const add = (value) => {
    try {
      const normalized = normalizeDiscoveryBaseUrl(value);
      if (!normalized || seen.has(normalized)) return;
      const parsed = new URL(normalized);
      if (!isLoopbackHost(parsed.hostname)) return;
      seen.add(normalized);
      urls.push(normalized);
    } catch (_) {
      // Ignore malformed discovery hints.
    }
  };

  preferredUrls.forEach(add);
  readCachedHermesDesktopUrls().forEach(add);
  HERMES_DESKTOP_KNOWN_URLS.forEach(add);
  return urls;
}

function wsSchemeFor(protocol) {
  return protocol === 'https:' ? 'wss:' : 'ws:';
}

function buildHermesDesktopWsUrl(baseUrl, credentialKey, credential, basePath = '') {
  const prefix = String(basePath || baseUrl.pathname || '').replace(/\/+$/, '');
  const wsUrl = new URL(`${prefix}/api/ws`, `${wsSchemeFor(baseUrl.protocol)}//${baseUrl.host}`);
  wsUrl.searchParams.set(credentialKey, credential);
  return wsUrl.toString();
}

function readTicketValue(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return payload.ticket || payload.wsTicket || payload.ws_ticket || payload.token || payload.value || '';
}

async function resolveHermesDesktopBaseUrl(baseUrl, options = {}) {
  const { signal, requireHermesMarker = false } = options;
  const rootResponse = await fetch(baseUrl.toString() || '/', {
    cache: 'no-store',
    credentials: 'omit',
    signal
  });
  if (!rootResponse.ok) {
    throw new Error(`Hermes Desktop HTTP check failed (${rootResponse.status})`);
  }

  const html = await rootResponse.text();
  const injectedBasePath = parseInjectedJsonString(html, '__HERMES_BASE_PATH__');
  const token = parseInjectedJsonString(html, '__HERMES_SESSION_TOKEN__');
  const hermesMarker = Boolean(token || injectedBasePath || looksLikeHermesDesktopHtml(html));
  if (requireHermesMarker && !hermesMarker) {
    throw new Error('Not a Hermes Desktop endpoint');
  }

  if (token) {
    rememberHermesDesktopBaseUrl(baseUrl);
    return buildHermesDesktopWsUrl(baseUrl, 'token', token, injectedBasePath);
  }

  const prefix = String(injectedBasePath || baseUrl.pathname || '').replace(/\/+$/, '');
  const ticketUrl = new URL(`${prefix}/api/auth/ws-ticket`, baseUrl.origin);
  const ticketResponse = await fetch(ticketUrl.toString(), {
    method: 'POST',
    cache: 'no-store',
    credentials: 'include',
    signal
  });
  if (!ticketResponse.ok) {
    throw new Error(`Hermes Desktop WebSocket ticket failed (${ticketResponse.status})`);
  }
  const ticket = readTicketValue(await ticketResponse.json().catch(() => null));
  if (!ticket) throw new Error('Hermes Desktop did not return a WebSocket ticket');
  rememberHermesDesktopBaseUrl(baseUrl);
  return buildHermesDesktopWsUrl(baseUrl, 'ticket', ticket, injectedBasePath);
}

async function resolveHermesDesktopBaseUrlWithTimeout(baseUrl, timeoutMs = 4000) {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = controller
    ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
    : 0;
  try {
    return await resolveHermesDesktopBaseUrl(baseUrl, { signal: controller?.signal });
  } finally {
    if (timer) globalThis.clearTimeout(timer);
  }
}

async function probeHermesDesktopUrl(rawUrl, timeoutMs = HERMES_DESKTOP_PROBE_TIMEOUT_MS) {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = controller
    ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
    : 0;
  try {
    const baseUrl = normalizeHttpBaseUrl(rawUrl);
    return await resolveHermesDesktopBaseUrl(baseUrl, {
      requireHermesMarker: true,
      signal: controller?.signal
    });
  } catch (_) {
    return '';
  } finally {
    if (timer) globalThis.clearTimeout(timer);
  }
}

async function probeHermesDesktopUrls(urls, concurrency = 16, timeoutMs = 450) {
  let index = 0;
  let found = '';
  const workers = Array.from({ length: Math.min(concurrency, Math.max(urls.length, 1)) }, async () => {
    while (!found && index < urls.length) {
      const current = urls[index];
      index += 1;
      const resolved = await probeHermesDesktopUrl(current, timeoutMs);
      if (resolved) found = resolved;
    }
  });
  await Promise.all(workers);
  return found;
}

async function scanHermesDesktopPorts(start, end, step) {
  let port = start;
  let found = '';
  const shouldContinue = () => step > 0 ? port <= end : port >= end;
  const workers = Array.from({ length: HERMES_DESKTOP_DISCOVERY_CONCURRENCY }, async () => {
    while (!found && shouldContinue()) {
      const current = port;
      port += step;
      const resolved = await probeHermesDesktopUrl(`http://127.0.0.1:${current}`);
      if (resolved) found = resolved;
    }
  });
  await Promise.all(workers);
  return found;
}

export async function discoverHermesDesktopConnectionUrl(options = {}) {
  const cached = await probeHermesDesktopUrls(uniqueHermesCandidateUrls(options.preferredUrls), 16, 500);
  if (cached) return cached;

  const highDynamic = await scanHermesDesktopPorts(65535, 49152, -1);
  if (highDynamic) return highDynamic;

  const midDynamic = await scanHermesDesktopPorts(49151, 32768, -1);
  if (midDynamic) return midDynamic;

  throw new Error('Hermes Desktop auto discovery failed. Open Hermes Desktop, then retry or paste its local URL.');
}

export function redactHermesUrl(url) {
  try {
    const parsed = new URL(url);
    ['token', 'ticket', 'internal'].forEach((key) => {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, '***');
    });
    return parsed.toString();
  } catch (_) {
    return String(url || '').replace(/([?&](?:token|ticket|internal)=)[^&]+/gi, '$1***');
  }
}

export async function resolveHermesConnectionUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value || isAutoHermesUrl(value)) return discoverHermesDesktopConnectionUrl();
  if (/^wss?:\/\//i.test(value)) return value;
  if (!/^https?:\/\//i.test(value)) {
    throw new Error('Hermes URL must be auto or start with ws://, wss://, http://, or https://');
  }

  const baseUrl = normalizeHttpBaseUrl(value);
  try {
    return await resolveHermesDesktopBaseUrlWithTimeout(baseUrl);
  } catch (error) {
    if (isLoopbackHost(baseUrl.hostname)) {
      return discoverHermesDesktopConnectionUrl({ preferredUrls: [baseUrl.toString()] });
    }
    throw error;
  }
}

function normalizeIncomingPacket(raw) {
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== 'object') {
    return { type: 'message', data: { text: String(parsed ?? '') }, raw: parsed };
  }

  if (parsed.jsonrpc === '2.0') {
    if (parsed.method === 'event') {
      const params = parsed.params || {};
      return {
        id: parsed.id || '',
        type: params.type || 'event',
        role: '',
        data: params.payload ?? params,
        raw: parsed,
        receivedAt: Date.now()
      };
    }

    if (parsed.error) {
      return {
        id: parsed.id || '',
        type: 'error',
        role: '',
        data: parsed.error,
        raw: parsed,
        receivedAt: Date.now()
      };
    }

    if (parsed.id !== undefined) {
      return {
        id: parsed.id || '',
        type: 'response',
        role: '',
        data: parsed.result || {},
        raw: parsed,
        receivedAt: Date.now()
      };
    }
  }

  const data = parsed.data || parsed.payload || parsed.result || parsed;
  return {
    id: parsed.id || parsed.requestId || data?.id || data?.requestId || '',
    type: parsed.type || parsed.event || parsed.kind || data?.type || data?.event || 'message',
    role: parsed.role || data?.role || '',
    data,
    raw: parsed,
    receivedAt: Date.now()
  };
}

function serializePacket(type, payload = {}) {
  return JSON.stringify({
    type,
    ...payload,
    sentAt: new Date().toISOString()
  });
}

export class HermesSocketClient {
  constructor(options = {}) {
    this.url = options.url || '';
    this.agent = options.agent || 'hermes';
    this.socket = null;
    this.protocol = 'custom';
    this.gatewaySessionId = '';
    this.rpcCounter = 0;
    this.pendingRpc = new Map();
    this.state = SOCKET_STATES.idle;
    this.handlers = {
      state: options.onState || (() => {}),
      message: options.onMessage || (() => {}),
      error: options.onError || (() => {}),
      close: options.onClose || (() => {})
    };
  }

  get isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  emitState(nextState, detail = {}) {
    this.state = nextState;
    this.handlers.state({ state: nextState, detail, at: Date.now() });
  }

  async connect(url = this.url) {
    const connectUrl = String(url || '').trim() || 'auto';
    if (this.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(this.socket.readyState)) {
      return;
    }

    this.url = connectUrl;
    this.emitState(SOCKET_STATES.connecting, { url: redactHermesUrl(connectUrl) });
    let resolvedUrl = '';
    try {
      resolvedUrl = await resolveHermesConnectionUrl(connectUrl);
    } catch (error) {
      this.emitState(SOCKET_STATES.error, { url: redactHermesUrl(connectUrl), reason: error?.message || '' });
      this.handlers.error(error);
      throw error;
    }

    const safeUrl = redactHermesUrl(resolvedUrl);
    this.protocol = new URL(resolvedUrl).pathname.endsWith('/api/ws') ? 'gateway' : 'custom';
    const socket = new WebSocket(resolvedUrl);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.emitState(SOCKET_STATES.open, { url: safeUrl });
      if (this.protocol !== 'gateway') {
        this.send('agent.hello', {
          agent: this.agent,
          client: 'hermes-agent-os',
          capabilities: ['stream', 'tasks', 'live2d-control', 'tool-events']
        });
      }
    });

    socket.addEventListener('message', (event) => {
      const packet = normalizeIncomingPacket(event.data);
      this.resolveRpcPacket(packet.raw);
      this.handlers.message(packet);
    });

    socket.addEventListener('error', (event) => {
      this.emitState(SOCKET_STATES.error, { url: safeUrl });
      this.handlers.error(event);
    });

    socket.addEventListener('close', (event) => {
      this.emitState(SOCKET_STATES.closed, {
        code: event.code,
        reason: event.reason || ''
      });
      this.rejectAllRpc(new Error(event.reason || 'Hermes WebSocket closed'));
      this.handlers.close(event);
    });
  }

  close() {
    if (!this.socket) return;
    this.emitState(SOCKET_STATES.closing);
    this.socket.close(1000, 'client disconnect');
    this.rejectAllRpc(new Error('Hermes WebSocket closed'));
  }

  send(type, payload = {}) {
    if (!this.isOpen) {
      throw new Error('Hermes WebSocket is not connected');
    }
    this.socket.send(serializePacket(type, payload));
  }

  sendJsonRpc(method, params = {}) {
    if (!this.isOpen) {
      throw new Error('Hermes WebSocket is not connected');
    }
    const id = `agent_os_${Date.now().toString(36)}_${++this.rpcCounter}`;
    this.socket.send(JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    }));
    return id;
  }

  request(method, params = {}, timeoutMs = 30000) {
    const id = this.sendJsonRpc(method, params);
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        this.pendingRpc.delete(id);
        reject(new Error(`Hermes request timed out: ${method}`));
      }, timeoutMs);
      this.pendingRpc.set(id, { resolve, reject, timer });
    });
  }

  resolveRpcPacket(packet) {
    if (!packet || packet.jsonrpc !== '2.0' || packet.id === undefined) return;
    const pending = this.pendingRpc.get(String(packet.id));
    if (!pending) return;
    globalThis.clearTimeout(pending.timer);
    this.pendingRpc.delete(String(packet.id));
    if (packet.error) {
      pending.reject(new Error(packet.error.message || 'Hermes JSON-RPC error'));
    } else {
      pending.resolve(packet.result || {});
    }
  }

  rejectAllRpc(error) {
    this.pendingRpc.forEach((pending) => {
      globalThis.clearTimeout(pending.timer);
      pending.reject(error);
    });
    this.pendingRpc.clear();
  }

  async ensureGatewaySession({ workspace, title = '' } = {}) {
    if (this.gatewaySessionId) return this.gatewaySessionId;
    const created = await this.request('session.create', {
      cwd: workspace || '',
      source: 'agent-os',
      title: title || 'Agent OS',
      cols: 100
    }, 60000);
    this.gatewaySessionId = created.session_id || created.sessionId || '';
    if (!this.gatewaySessionId) throw new Error('Hermes did not create a session');
    return this.gatewaySessionId;
  }

  async run({ input, workspace, mode, metadata = {} }) {
    if (this.protocol === 'gateway') {
      const sessionId = await this.ensureGatewaySession({
        workspace,
        title: input.slice(0, 80)
      });
      await this.request('prompt.submit', {
        session_id: sessionId,
        text: input
      }, 1800000);
      return sessionId;
    }

    const requestId = createRequestId('hermes');
    this.send('agent.run', {
      requestId,
      agent: this.agent,
      input,
      context: {
        workspace,
        mode,
        ...metadata
      }
    });
    return requestId;
  }

  stop(requestId = '') {
    if (this.protocol === 'gateway') {
      const sessionId = requestId || this.gatewaySessionId;
      if (sessionId) {
        return this.request('session.interrupt', { session_id: sessionId }, 30000);
      }
      return Promise.resolve();
    }
    this.send('agent.stop', {
      requestId,
      agent: this.agent
    });
  }

  sendLive2D(intent) {
    if (this.protocol === 'gateway') {
      return;
    }
    this.send('live2d.control', {
      agent: this.agent,
      live2d: intent
    });
  }
}

export { SOCKET_STATES, normalizeIncomingPacket };
