import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activateUserStorageScope,
  currentUserStorageScope,
  hasLegacyLocalData,
  importLegacyLocalData,
  installUserScopedLocalStorage,
  scopedStorageKey,
  storageScopeForUser
} from '../src/services/userLocalStorage.js';
import { DEFAULT_ROOM_MEMORY_SETTINGS } from '../src/services/room/roomSettings.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  get length() {
    return this.values.size;
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }

  clear() {
    this.values.clear();
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }
}

test('isolates Agent OS local data by authenticated user', () => {
  const storage = new MemoryStorage();
  const alice = { id: 'user-alice', username: 'alice' };
  const bob = { id: 'user-bob', username: 'bob' };
  const fakeWindow = {
    localStorage: storage,
    dispatchEvent() {}
  };

  globalThis.Storage = MemoryStorage;
  globalThis.window = fakeWindow;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  };

  storage.setItem('tsukuyomi_user', JSON.stringify(alice));
  storage.setItem('hermesAgentOsNotes:v1', JSON.stringify([{ id: 'legacy-note' }]));
  installUserScopedLocalStorage(fakeWindow);

  assert.equal(currentUserStorageScope(), storageScopeForUser(alice));
  assert.equal(storage.getItem('hermesAgentOsNotes:v1'), null);
  assert.equal(hasLegacyLocalData(), true);
  assert.equal(importLegacyLocalData(), 1);
  assert.deepEqual(JSON.parse(storage.getItem('hermesAgentOsNotes:v1')), [{ id: 'legacy-note' }]);

  storage.setItem('hermesAgentOsConversations:v1', 'alice-private');
  assert.equal(
    storage.values.get(scopedStorageKey('hermesAgentOsConversations:v1')),
    'alice-private'
  );

  assert.equal(activateUserStorageScope(bob), true);
  assert.equal(storage.getItem('hermesAgentOsConversations:v1'), null);
  storage.setItem('hermesAgentOsConversations:v1', 'bob-private');

  assert.equal(activateUserStorageScope(alice), true);
  assert.equal(storage.getItem('hermesAgentOsConversations:v1'), 'alice-private');
  storage.clear();
  assert.equal(storage.getItem('hermesAgentOsConversations:v1'), null);
  assert.equal(storage.values.get('tsukuyomi_user'), JSON.stringify(alice));

  assert.equal(activateUserStorageScope(bob), true);
  assert.equal(storage.getItem('hermesAgentOsConversations:v1'), 'bob-private');
});

test('keeps remote long-term memory opt-in', () => {
  assert.equal(DEFAULT_ROOM_MEMORY_SETTINGS.enabled, false);
  assert.equal(DEFAULT_ROOM_MEMORY_SETTINGS.writeMode, 'off');
  assert.equal(DEFAULT_ROOM_MEMORY_SETTINGS.retrievalMode, 'off');
  assert.equal(DEFAULT_ROOM_MEMORY_SETTINGS.allowViewerMemory, false);
  assert.equal(DEFAULT_ROOM_MEMORY_SETTINGS.allowSessionMemory, false);
});
