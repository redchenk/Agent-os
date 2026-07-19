import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_GPT_SOVITS_GPT_WEIGHT,
  DEFAULT_GPT_SOVITS_SOVITS_WEIGHT,
  LEGACY_GPT_SOVITS_GPT_WEIGHT,
  LEGACY_GPT_SOVITS_SOVITS_WEIGHT,
  gptSovitsStreamingParams,
  upgradeLegacyGptSovitsQuality
} from '../src/services/room/gptSovitsQuality.js';

test('uses the trained high-quality weights and low-latency quality stream mode', () => {
  assert.equal(DEFAULT_GPT_SOVITS_GPT_WEIGHT, 'GPT_weights_v2ProPlus/yachiyo-v2pro-e20.ckpt');
  assert.equal(DEFAULT_GPT_SOVITS_SOVITS_WEIGHT, 'SoVITS_weights_v2ProPlus/yachiyo-v2pro_e12_s684.pth');
  assert.deepEqual(gptSovitsStreamingParams(), {
    streaming_mode: '1',
    parallel_infer: 'false',
    fragment_interval: '0.08'
  });
});

test('migrates only the old bundled pair and preserves custom weights', () => {
  const oldSettings = {
    provider: 'gpt-sovits',
    gptWeightPath: LEGACY_GPT_SOVITS_GPT_WEIGHT,
    sovitsWeightPath: LEGACY_GPT_SOVITS_SOVITS_WEIGHT
  };
  assert.deepEqual(upgradeLegacyGptSovitsQuality(oldSettings), {
    provider: 'gpt-sovits',
    gptWeightPath: DEFAULT_GPT_SOVITS_GPT_WEIGHT,
    sovitsWeightPath: DEFAULT_GPT_SOVITS_SOVITS_WEIGHT
  });

  const custom = {
    provider: 'gpt-sovits',
    gptWeightPath: 'GPT_weights/custom.ckpt',
    sovitsWeightPath: 'SoVITS_weights/custom.pth'
  };
  assert.equal(upgradeLegacyGptSovitsQuality(custom), custom);
});
