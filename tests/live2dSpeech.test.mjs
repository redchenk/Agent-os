import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldTranslateLocalGptSovitsText, splitSpeechText } from '../src/services/room/live2dSpeech.js';
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

test('splits long speech so the first natural sentence can start immediately', () => {
  const text = '第一句很快开始。第二句会在播放时预取，后面的内容不会阻塞第一句，也不会让很长的一句话拖慢开口。';
  const chunks = splitSpeechText(text);
  assert.equal(chunks[0], '第一句很快开始。');
  assert.ok(chunks.every((chunk) => chunk.length <= 28));
  assert.equal(chunks.join(''), text);
});

test('ships a usable Yachiyo reference voice for first-run local synthesis', () => {
  const settings = normalizeRoomTTSSettings({ provider: 'gpt-sovits' });
  assert.equal(settings.refAudioPath, 'reference/yachiyo_ref_ja.wav');
  assert.equal(settings.promptText, 'こんにちは、八千代です。');
});
