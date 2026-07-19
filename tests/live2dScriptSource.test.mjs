import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../src/services/room/live2dBridge.js', import.meta.url), 'utf8');

test('loads executable Live2D scripts from the Agent OS origin', () => {
  assert.match(source, /function live2DScriptUrl\(path\)[\s\S]*agentOsPublicUrl\(path\)/);
  assert.match(source, /loadScript\(live2DScriptUrl\(CORE_SCRIPT\)\)/);
  assert.match(source, /loadScript\(live2DScriptUrl\(ROOM_SCRIPT\)\)/);
  assert.doesNotMatch(source, /loadScript\(live2DAssetUrl\((?:CORE_SCRIPT|ROOM_SCRIPT)\)\)/);
});
