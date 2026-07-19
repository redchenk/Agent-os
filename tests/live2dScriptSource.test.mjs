import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../src/services/room/live2dBridge.js', import.meta.url), 'utf8');
const bundledSource = fs.readFileSync(
  new URL('../public/lib/bundled/live2d-room-neuro-live.agent-os-v3.iife.js', import.meta.url),
  'utf8'
);

test('loads executable Live2D scripts and model assets from the Agent OS origin', () => {
  assert.match(source, /function live2DScriptUrl\(path\)[\s\S]*agentOsPublicUrl\(path\)/);
  assert.match(source, /function live2DAssetUrl\(path\)[\s\S]*agentOsPublicUrl\(path\)/);
  assert.match(source, /TSUKUYOMI_LIVE2D_ASSET_BASE_URL = agentOsPublicUrl\(\)/);
  assert.match(source, /loadScript\(live2DScriptUrl\(CORE_SCRIPT\)\)/);
  assert.match(source, /loadScript\(live2DScriptUrl\(ROOM_SCRIPT\)\)/);
  assert.doesNotMatch(source, /loadScript\(live2DAssetUrl\((?:CORE_SCRIPT|ROOM_SCRIPT)\)\)/);
  assert.match(bundledSource, /TSUKUYOMI_LIVE2D_ASSET_BASE_URL\|\|window\.TSUKUYOMI_ASSET_BASE_URL/);
});
