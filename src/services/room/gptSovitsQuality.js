export const LEGACY_GPT_SOVITS_GPT_WEIGHT = 'GPT_weights_v2ProPlus/yachiyo-v2pro-e15.ckpt';
export const LEGACY_GPT_SOVITS_SOVITS_WEIGHT = 'SoVITS_weights_v2ProPlus/yachiyo-v2pro_e8_s456.pth';
export const DEFAULT_GPT_SOVITS_GPT_WEIGHT = 'GPT_weights_v2ProPlus/yachiyo-v2pro-e20.ckpt';
export const DEFAULT_GPT_SOVITS_SOVITS_WEIGHT = 'SoVITS_weights_v2ProPlus/yachiyo-v2pro_e12_s684.pth';

export function gptSovitsStreamingParams() {
  return {
    streaming_mode: '1',
    parallel_infer: 'false',
    fragment_interval: '0.08'
  };
}

export function upgradeLegacyGptSovitsQuality(settings = {}, rawSettings = settings) {
  if (settings.provider !== 'gpt-sovits') return settings;
  const rawGptWeight = String(rawSettings?.gptWeightPath || '').trim();
  const rawSovitsWeight = String(rawSettings?.sovitsWeightPath || '').trim();
  const usesLegacyBundledPair = rawGptWeight === LEGACY_GPT_SOVITS_GPT_WEIGHT
    && rawSovitsWeight === LEGACY_GPT_SOVITS_SOVITS_WEIGHT;
  if (!usesLegacyBundledPair) return settings;
  return {
    ...settings,
    gptWeightPath: DEFAULT_GPT_SOVITS_GPT_WEIGHT,
    sovitsWeightPath: DEFAULT_GPT_SOVITS_SOVITS_WEIGHT
  };
}
