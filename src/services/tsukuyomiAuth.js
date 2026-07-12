const USER_STORAGE_KEY = 'tsukuyomi_user';
const ADMIN_STORAGE_KEY = 'admin_user';
const LEGACY_USER_TOKEN_KEY = 'tsukuyomi_token';
const LEGACY_ADMIN_TOKEN_KEY = 'admin_token';
const API_BASE_STORAGE_KEY = 'tsukuyomi_api_base_url';
const OAUTH_PLACEHOLDER_DOMAIN = '@oauth.yachiyo.local';

export async function parseTsukuyomiResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : { success: false, message: `HTTP ${response.status}` };
  } catch (_) {
    return {
      success: false,
      message: text.replace(/<[^>]*>/g, '').trim().slice(0, 160) || `HTTP ${response.status}`
    };
  }
}

export function tsukuyomiApiUrl(url) {
  const value = String(url || '');
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.startsWith('/api')) return value;
  if (typeof window === 'undefined') return value;

  const override = localStorage.getItem(API_BASE_STORAGE_KEY) || '';
  const base = override.trim().replace(/\/+$/, '');
  return base ? `${base}${value}` : value;
}

export function tsukuyomiSiteUrl(path = '/login') {
  const value = String(path || '/login');
  if (/^https?:\/\//i.test(value)) return value;
  if (typeof window === 'undefined') return value;

  const override = localStorage.getItem('tsukuyomi_site_base_url') || '';
  const apiOverride = localStorage.getItem(API_BASE_STORAGE_KEY) || '';
  const base = (override || apiOverride || window.location.origin).trim().replace(/\/+$/, '');
  return `${base}${value.startsWith('/') ? value : `/${value}`}`;
}

export function tsukuyomiAuthFetch(url, options = {}) {
  return fetch(tsukuyomiApiUrl(url), {
    ...options,
    credentials: options.credentials || 'include'
  });
}

export function noStoreTsukuyomiUrl(url) {
  const value = String(url || '');
  const hashIndex = value.indexOf('#');
  const base = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : '';
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}_=${Date.now()}${hash}`;
}

function dropLegacyTokens() {
  localStorage.removeItem(LEGACY_USER_TOKEN_KEY);
  localStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY);
}

function isOAuthPlaceholderEmail(email) {
  return String(email || '').trim().toLowerCase().endsWith(OAUTH_PLACEHOLDER_DOMAIN);
}

export function sanitizeTsukuyomiUser(user) {
  if (!user || typeof user !== 'object') return null;
  const next = { ...user };
  if (isOAuthPlaceholderEmail(next.email)) {
    next.email = '';
    next.has_real_email = false;
  }
  return next;
}

export function readStoredTsukuyomiSession() {
  dropLegacyTokens();
  const userStr = localStorage.getItem(USER_STORAGE_KEY) || localStorage.getItem(ADMIN_STORAGE_KEY);
  if (!userStr) return null;

  try {
    const user = sanitizeTsukuyomiUser(JSON.parse(userStr));
    return user ? { user, admin: Boolean(localStorage.getItem(ADMIN_STORAGE_KEY)) } : null;
  } catch (_) {
    return null;
  }
}

export function saveTsukuyomiUserSession(user) {
  dropLegacyTokens();
  localStorage.removeItem(ADMIN_STORAGE_KEY);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(sanitizeTsukuyomiUser(user)));
}

export function clearTsukuyomiSession() {
  dropLegacyTokens();
  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem(ADMIN_STORAGE_KEY);
}

function isAuthFailure(response, result) {
  const status = Number(response?.status || 0);
  const code = String(result?.code || '').toUpperCase();
  return status === 401
    || status === 403
    || ['UNAUTHORIZED', 'TOKEN_EXPIRED', 'TOKEN_INVALID', 'TOKEN_REVOKED', 'FORBIDDEN'].includes(code);
}

function readableAuthMessage(message, status, fallback = '请求失败，请稍后再试。') {
  const text = String(message || '').trim();
  const looksBroken = /[�]|璇|鐧|楠|浠|鏈|绠|棤|鍙|敤|湇|姝/.test(text);
  if (text && !looksBroken) return text;

  switch (Number(status || 0)) {
    case 400:
      return '请完整填写账号登录信息。';
    case 401:
    case 403:
      return '账号、密码或验证码不正确。';
    case 404:
      return '没有找到对应的 Tsukuyomi Space 账号。';
    case 429:
      return '登录尝试太频繁，请稍后再试。';
    case 500:
      return 'Tsukuyomi Space 服务端暂时不可用。';
    case 503:
      return '邮箱验证码服务尚未配置。';
    default:
      return fallback;
  }
}

export async function loadTsukuyomiSession({ allowCachedOnNetworkError = true } = {}) {
  const cached = readStoredTsukuyomiSession();
  try {
    const response = await tsukuyomiAuthFetch(noStoreTsukuyomiUrl('/api/auth/me'), {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    const result = await parseTsukuyomiResponse(response);
    if (result.success && result.data) {
      const user = sanitizeTsukuyomiUser(result.data);
      saveTsukuyomiUserSession(user);
      return { user, admin: false, verified: true };
    }
    if (isAuthFailure(response, result)) clearTsukuyomiSession();
    return null;
  } catch (error) {
    if (allowCachedOnNetworkError && cached?.user) {
      return { ...cached, verified: false, softError: error };
    }
    throw error;
  }
}

export async function loginTsukuyomiAccount({ username, password, emailCode, loginMethod = 'password' }) {
  const response = await tsukuyomiAuthFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      username: String(username || '').trim(),
      password: String(password || ''),
      emailCode: String(emailCode || '').trim(),
      loginMethod: loginMethod === 'code' ? 'code' : 'password'
    })
  });
  const result = await parseTsukuyomiResponse(response);
  if (!response.ok || !result.success) {
    throw new Error(readableAuthMessage(result.message, response.status, `登录失败：HTTP ${response.status}`));
  }
  const user = sanitizeTsukuyomiUser(result.data?.user);
  if (!user) throw new Error('Tsukuyomi 登录成功但没有返回用户信息。');
  saveTsukuyomiUserSession(user);
  return { user, message: result.message || '登录成功' };
}

export async function requestTsukuyomiLoginCode(email) {
  const response = await tsukuyomiAuthFetch('/api/auth/email-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: String(email || '').trim(), purpose: 'login' })
  });
  const result = await parseTsukuyomiResponse(response);
  if (!response.ok || !result.success) {
    throw new Error(readableAuthMessage(result.message, response.status, `验证码发送失败：HTTP ${response.status}`));
  }
  return readableAuthMessage(result.message, response.status, '验证码已发送');
}
