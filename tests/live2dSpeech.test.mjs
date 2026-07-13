import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldTranslateLocalGptSovitsText } from '../src/services/room/live2dSpeech.js';
import { normalizeRoomTTSSettings } from '../src/services/room/roomSettings.js';

test('keeps auto-detected local GPT-SoVITS speech on the direct path', () => {
  assert.equal(shouldTranslateLocalGptSovitsText('你好，我是夜千代。', { textLang: 'auto' }), false);
  assert.equal(shouldTranslateLocalGptSovitsText('Hello, Yachiyo.', { textLang: 'auto' }), false);
});

test('only translates non-Japanese text when Japanese output is explicit', () => {
  assert.equal(shouldTranslateLocalGptSovitsText('你好，我是夜千代。', { textLang: 'ja' }), true);
  assert.equal(shouldTranslateLocalGptSovitsText('こんにちは、八千代です。', { textLang: 'ja' }), false);
  assert.equal(shouldTranslateLocalGptSovitsText('你好，我是夜千代。', { textLang: 'zh' }), false);
});

test('keeps local GPT-SoVITS direct and preserves the low-latency fields', () => {
  const settings = normalizeRoomTTSSettings({
    enabled: true,
    provider: 'gpt-sovits',
    apiUrl: 'http://localhost:9880/tts',
    textLang: 'auto',
    promptLang: 'ja',
    refAudioPath: 'voices/yachiyo.wav',
    promptText: 'こんにちは。',
    useProxy: true
  });

  assert.equal(settings.useProxy, false);
  assert.equal(settings.textLang, 'auto');
  assert.equal(settings.promptLang, 'ja');
  assert.equal(settings.refAudioPath, 'voices/yachiyo.wav');
  assert.equal(settings.promptText, 'こんにちは。');
});
