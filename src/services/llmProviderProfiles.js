export const AGENT_LLM_PROVIDER_PRESETS = Object.freeze({
  'openai-compatible': Object.freeze({
    label: 'OpenAI Compatible',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini'
  }),
  openai: Object.freeze({
    label: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini'
  }),
  deepseek: Object.freeze({
    label: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-v4-flash'
  }),
  openrouter: Object.freeze({
    label: 'OpenRouter',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openai/gpt-4o-mini'
  }),
  moonshot: Object.freeze({
    label: 'Moonshot / Kimi',
    apiUrl: 'https://api.moonshot.cn/v1/chat/completions',
    model: 'moonshot-v1-8k'
  }),
  siliconflow: Object.freeze({
    label: 'SiliconFlow',
    apiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    model: 'deepseek-ai/DeepSeek-V3'
  }),
  xai: Object.freeze({
    label: 'xAI',
    apiUrl: 'https://api.x.ai/v1/chat/completions',
    model: 'grok-2'
  }),
  custom: Object.freeze({
    label: 'Custom',
    apiUrl: '',
    model: 'gpt-4o-mini'
  })
});

export const AGENT_LLM_PROVIDER_OPTIONS = Object.entries(AGENT_LLM_PROVIDER_PRESETS).map(([value, preset]) => ({
  value,
  label: preset.label
}));

const PROVIDER_ALIASES = Object.freeze({
  compatible: 'openai-compatible',
  'openai_compatible': 'openai-compatible',
  kimi: 'moonshot',
  moonshotai: 'moonshot',
  'silicon-flow': 'siliconflow',
  'x-ai': 'xai'
});

function asText(value) {
  return String(value || '').trim();
}

export function normalizeAgentLlmProvider(provider) {
  const raw = asText(provider).toLowerCase();
  const key = PROVIDER_ALIASES[raw] || raw;
  return Object.prototype.hasOwnProperty.call(AGENT_LLM_PROVIDER_PRESETS, key) ? key : 'custom';
}

function normalizeProfile(profile = {}, preset = AGENT_LLM_PROVIDER_PRESETS.custom) {
  return {
    apiUrl: asText(profile.apiUrl) || preset.apiUrl,
    apiKey: asText(profile.apiKey),
    model: asText(profile.model) || preset.model
  };
}

function migrateLegacyProfile(provider, profile) {
  if (
    provider === 'deepseek'
    && profile.apiUrl === AGENT_LLM_PROVIDER_PRESETS.deepseek.apiUrl
    && profile.model === 'deepseek-chat'
  ) {
    return { ...profile, model: AGENT_LLM_PROVIDER_PRESETS.deepseek.model };
  }
  return profile;
}

function readStoredProfiles(settings = {}) {
  const stored = settings.llmProviderProfiles;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return Object.fromEntries(Object.keys(AGENT_LLM_PROVIDER_PRESETS).flatMap((provider) => {
    const profile = stored[provider];
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return [];
    return [[provider, migrateLegacyProfile(
      provider,
      normalizeProfile(profile, AGENT_LLM_PROVIDER_PRESETS[provider])
    )]];
  }));
}

function currentProfile(settings = {}, provider = normalizeAgentLlmProvider(settings.llmProvider)) {
  return normalizeProfile({
    apiUrl: settings.llmApiUrl,
    apiKey: settings.llmApiKey,
    model: settings.llmModel
  }, AGENT_LLM_PROVIDER_PRESETS[provider]);
}

export function switchAgentLlmProvider(settings = {}, nextProvider = '') {
  const currentProvider = normalizeAgentLlmProvider(settings.llmProvider);
  const targetProvider = normalizeAgentLlmProvider(nextProvider);
  const profiles = {
    ...readStoredProfiles(settings),
    [currentProvider]: currentProfile(settings, currentProvider)
  };
  const targetProfile = profiles[targetProvider]
    || normalizeProfile({}, AGENT_LLM_PROVIDER_PRESETS[targetProvider]);

  return {
    llmProvider: targetProvider,
    llmApiUrl: targetProfile.apiUrl,
    llmApiKey: targetProfile.apiKey,
    llmModel: targetProfile.model,
    llmProviderProfiles: {
      ...profiles,
      [targetProvider]: targetProfile
    }
  };
}

export function migrateAgentLlmProviderSettings(settings = {}) {
  const provider = normalizeAgentLlmProvider(settings.llmProvider);
  const profiles = readStoredProfiles(settings);
  const current = migrateLegacyProfile(provider, currentProfile(settings, provider));
  return {
    llmApiUrl: current.apiUrl,
    llmApiKey: current.apiKey,
    llmModel: current.model,
    llmProviderProfiles: {
      ...profiles,
      [provider]: current
    }
  };
}
