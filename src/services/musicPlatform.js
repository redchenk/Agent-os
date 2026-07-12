import { agentOsRuntimeHttpUrl } from '../modules/agentOs/runtimeUrls';

const MUSIC_BRIDGE_URL = agentOsRuntimeHttpUrl();
const ACCOUNT_STORAGE_KEY = 'agentOsMusicAccounts:v1';
const PREFERENCES_STORAGE_KEY = 'agentOsMusicPreferences:v1';

export const MUSIC_PROVIDERS = [
  { id: 'netease', name: '网易云音乐', shortName: '网易云', accent: '#e5484d' },
  { id: 'qqmusic', name: 'QQ 音乐', shortName: 'QQ 音乐', accent: '#31c27c' }
];

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || '') || fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  return value;
}

async function requestMusic(path, body = {}) {
  const response = await fetch(new URL(String(path || '').replace(/^\/+/, ''), MUSIC_BRIDGE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `音乐服务请求失败 (${response.status})。`);
  }
  return data;
}

export function readMusicAccounts() {
  return readJson(ACCOUNT_STORAGE_KEY, {});
}

export function readMusicAccount(provider) {
  return readMusicAccounts()[provider] || { cookie: '', account: null, connected: false };
}

export function saveMusicAccount(provider, patch = {}) {
  const accounts = readMusicAccounts();
  accounts[provider] = {
    ...(accounts[provider] || {}),
    ...patch,
    updatedAt: Date.now()
  };
  writeJson(ACCOUNT_STORAGE_KEY, accounts);
  return accounts[provider];
}

export function clearMusicAccount(provider) {
  const accounts = readMusicAccounts();
  delete accounts[provider];
  writeJson(ACCOUNT_STORAGE_KEY, accounts);
}

export function readMusicPreferences() {
  return {
    provider: 'netease',
    quality: 'high',
    volume: 0.82,
    repeat: 'all',
    shuffle: false,
    favorites: [],
    history: [],
    ...readJson(PREFERENCES_STORAGE_KEY, {})
  };
}

export function saveMusicPreferences(patch = {}) {
  return writeJson(PREFERENCES_STORAGE_KEY, { ...readMusicPreferences(), ...patch });
}

function withAccount(provider, body = {}) {
  return { ...body, provider, cookie: readMusicAccount(provider).cookie || '' };
}

export async function searchMusic(provider, query, limit = 24) {
  return requestMusic('/music/search', withAccount(provider, { query, limit }));
}

export async function resolveMusicTrack(track, quality = 'high') {
  const provider = track?.provider || 'netease';
  return requestMusic('/music/resolve', withAccount(provider, { track, quality }));
}

export async function loadMusicLyrics(track) {
  const provider = track?.provider || 'netease';
  return requestMusic('/music/lyrics', withAccount(provider, { track, id: track?.id }));
}

export async function loadMusicRecommendations(provider, limit = 18) {
  return requestMusic('/music/recommendations', withAccount(provider, { limit }));
}

export async function validateMusicAccount(provider, cookie) {
  const result = await requestMusic('/music/account/validate', { provider, cookie });
  saveMusicAccount(provider, {
    cookie,
    account: result.account || null,
    connected: Boolean(result.connected)
  });
  return result;
}

export async function startNeteaseMusicLogin() {
  return requestMusic('/music/login/netease/start');
}

export async function checkNeteaseMusicLogin(key) {
  return requestMusic('/music/login/netease/check', { key });
}

export async function completeNeteaseMusicLogin(cookie) {
  return validateMusicAccount('netease', cookie);
}

export function musicProviderMeta(provider) {
  return MUSIC_PROVIDERS.find((item) => item.id === provider) || MUSIC_PROVIDERS[0];
}

export function formatTrackDuration(milliseconds = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
