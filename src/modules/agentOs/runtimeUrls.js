function normalizedPath(value = '') {
  return String(value || '').replace(/^\/+/, '');
}

function appBaseUrl() {
  if (typeof window === 'undefined') return new URL('http://127.0.0.1:5173/');
  return new URL(import.meta.env.BASE_URL || '/', window.location.origin);
}

export function agentOsRuntimeHttpUrl(path = '') {
  const suffix = normalizedPath(path);
  if (import.meta.env.DEV) return new URL(suffix, 'http://127.0.0.1:8787/').toString();
  return new URL(`runtime/${suffix}`, appBaseUrl()).toString();
}

export function agentOsRuntimeWebSocketUrl(path = 'hermes') {
  if (import.meta.env.DEV) return `ws://127.0.0.1:8787/${normalizedPath(path)}`;
  const url = new URL(`runtime/${normalizedPath(path)}`, appBaseUrl());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function agentOsPublicUrl(path = '') {
  return new URL(normalizedPath(path), appBaseUrl()).toString();
}
