const STORAGE_NAMESPACE = 'agentos:user:';
const GUEST_SCOPE = 'guest';

const GLOBAL_STORAGE_KEYS = new Set([
  'tsukuyomi_user',
  'admin_user',
  'tsukuyomi_token',
  'admin_token',
  'tsukuyomi_api_base_url',
  'tsukuyomi_site_base_url',
  'tsukuyomi_public_asset_base_url'
]);

const LEGACY_PRIVATE_KEY_PATTERNS = [
  /^hermesAgentOs/,
  /^agentOs/,
  /^room[A-Z]/,
  /^live2d/,
  /^__TSUKUYOMI_(?:LIVE2D|LOCAL_)/
];

let activeScopeId = GUEST_SCOPE;
let installed = false;
let localStorageRef = null;
let nativeGetItem = null;
let nativeSetItem = null;
let nativeRemoveItem = null;
let nativeClear = null;
let nativeKey = null;

function hashScope(value) {
  const text = String(value || '');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function storageScopeForUser(user) {
  const identity = user?.id || user?.email || user?.username || '';
  return identity ? `u-${hashScope(identity)}` : GUEST_SCOPE;
}

export function isGlobalStorageKey(key) {
  return GLOBAL_STORAGE_KEYS.has(String(key || ''));
}

export function scopedStorageKey(key, scopeId = activeScopeId) {
  const value = String(key || '');
  if (!value || isGlobalStorageKey(value) || value.startsWith(STORAGE_NAMESPACE)) return value;
  return `${STORAGE_NAMESPACE}${scopeId}:${value}`;
}

function isAgentOsLegacyKey(key) {
  const value = String(key || '');
  return LEGACY_PRIVATE_KEY_PATTERNS.some((pattern) => pattern.test(value));
}

function rawStoredUser(storage) {
  if (!storage || !nativeGetItem) return null;
  const value = nativeGetItem.call(storage, 'tsukuyomi_user')
    || nativeGetItem.call(storage, 'admin_user');
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function usesScopedLocalStorage(target) {
  return Boolean(localStorageRef && target === localStorageRef);
}

function rawKeys(storage) {
  const keys = [];
  if (!storage || !nativeKey) return keys;
  for (let index = 0; index < storage.length; index += 1) {
    const key = nativeKey.call(storage, index);
    if (key) keys.push(key);
  }
  return keys;
}

export function installUserScopedLocalStorage(targetWindow = globalThis.window) {
  if (installed || !targetWindow?.localStorage || typeof Storage === 'undefined') return activeScopeId;

  localStorageRef = targetWindow.localStorage;
  nativeGetItem = Storage.prototype.getItem;
  nativeSetItem = Storage.prototype.setItem;
  nativeRemoveItem = Storage.prototype.removeItem;
  nativeClear = Storage.prototype.clear;
  nativeKey = Storage.prototype.key;
  activeScopeId = storageScopeForUser(rawStoredUser(localStorageRef));

  Storage.prototype.getItem = function getScopedItem(key) {
    return nativeGetItem.call(this, usesScopedLocalStorage(this) ? scopedStorageKey(key) : key);
  };

  Storage.prototype.setItem = function setScopedItem(key, value) {
    return nativeSetItem.call(this, usesScopedLocalStorage(this) ? scopedStorageKey(key) : key, value);
  };

  Storage.prototype.removeItem = function removeScopedItem(key) {
    return nativeRemoveItem.call(this, usesScopedLocalStorage(this) ? scopedStorageKey(key) : key);
  };

  Storage.prototype.clear = function clearScopedItems() {
    if (!usesScopedLocalStorage(this)) return nativeClear.call(this);
    const prefix = `${STORAGE_NAMESPACE}${activeScopeId}:`;
    rawKeys(this)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => nativeRemoveItem.call(this, key));
    return undefined;
  };

  installed = true;
  return activeScopeId;
}

export function activateUserStorageScope(user) {
  const nextScopeId = storageScopeForUser(user);
  if (nextScopeId === activeScopeId) return false;
  activeScopeId = nextScopeId;
  globalThis.window?.dispatchEvent?.(new CustomEvent('agentos:storage-scope-change', {
    detail: { scopeId: activeScopeId }
  }));
  return true;
}

export function currentUserStorageScope() {
  return activeScopeId;
}

export function legacyLocalDataKeys() {
  if (!localStorageRef || !nativeGetItem) return [];
  return rawKeys(localStorageRef).filter((key) => (
    !key.startsWith(STORAGE_NAMESPACE)
    && !isGlobalStorageKey(key)
    && isAgentOsLegacyKey(key)
    && nativeGetItem.call(localStorageRef, key) !== null
  ));
}

export function hasLegacyLocalData() {
  return legacyLocalDataKeys().length > 0;
}

export function importLegacyLocalData() {
  if (!localStorageRef || !nativeGetItem || !nativeSetItem) return 0;
  let imported = 0;
  legacyLocalDataKeys().forEach((key) => {
    const destination = scopedStorageKey(key);
    if (nativeGetItem.call(localStorageRef, destination) !== null) return;
    const value = nativeGetItem.call(localStorageRef, key);
    if (value === null) return;
    nativeSetItem.call(localStorageRef, destination, value);
    imported += 1;
  });
  return imported;
}
