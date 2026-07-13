<script setup>
import { computed, reactive, ref } from 'vue';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  HardDrive,
  KeyRound,
  Link2,
  LockKeyhole,
  Monitor,
  Server,
  ShieldCheck,
  Sparkles,
  Volume2,
  Zap
} from 'lucide-vue-next';
import {
  AGENT_LLM_PROVIDER_OPTIONS,
  switchAgentLlmProvider
} from '../services/llmProviderProfiles';

const props = defineProps({
  user: { type: Object, default: null },
  legacyDataAvailable: { type: Boolean, default: false },
  initialTheme: { type: String, default: 'light' },
  initialPetMode: { type: Boolean, default: false },
  initialLlmProvider: { type: String, default: 'openai-compatible' },
  initialLlmApiUrl: { type: String, default: 'https://api.openai.com/v1/chat/completions' },
  initialLlmApiKey: { type: String, default: '' },
  initialLlmModel: { type: String, default: 'gpt-4o-mini' },
  initialLlmProviderProfiles: { type: Object, default: () => ({}) },
  initialTtsSettings: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['finish']);
const step = ref(0);
const theme = ref(props.initialTheme === 'dark' ? 'dark' : 'light');
const experience = ref(props.initialPetMode ? 'pet' : 'desktop');
const importLegacy = ref(false);
const userLabel = computed(() => props.user?.username || props.user?.email || '当前账号');
const llm = reactive({
  llmProvider: props.initialLlmProvider,
  llmApiUrl: props.initialLlmApiUrl,
  llmApiKey: props.initialLlmApiKey,
  llmModel: props.initialLlmModel,
  llmProviderProfiles: { ...props.initialLlmProviderProfiles }
});
const tts = reactive({
  enabled: true,
  provider: 'gpt-sovits',
  apiUrl: 'http://localhost:9880/tts',
  apiKey: '',
  model: 'auto',
  voice: '',
  refAudioPath: '',
  promptText: '',
  textLang: 'auto',
  promptLang: 'ja',
  gptWeightPath: 'GPT_weights_v2ProPlus/yachiyo-v2pro-e15.ckpt',
  sovitsWeightPath: 'SoVITS_weights_v2ProPlus/yachiyo-v2pro_e8_s456.pth',
  useProxy: false,
  ...props.initialTtsSettings,
  provider: 'gpt-sovits',
  useProxy: false
});

function changeLlmProvider(event) {
  Object.assign(llm, switchAgentLlmProvider(llm, event.target.value));
}

function finish() {
  emit('finish', {
    theme: theme.value,
    petMode: experience.value === 'pet',
    importLegacy: Boolean(props.legacyDataAvailable && importLegacy.value),
    llmProvider: llm.llmProvider,
    llmApiUrl: llm.llmApiUrl,
    llmApiKey: llm.llmApiKey,
    llmModel: llm.llmModel,
    llmProviderProfiles: llm.llmProviderProfiles,
    tts: { ...tts }
  });
}
</script>

<template>
  <section class="onboarding-screen" aria-label="Agent OS 首次访问引导">
    <div class="onboarding-shell" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <header class="onboarding-header">
        <div class="onboarding-brand">
          <span><Sparkles :size="18" /></span>
          <div>
            <strong>Agent OS</strong>
            <small>{{ userLabel }}</small>
          </div>
        </div>
        <button type="button" class="onboarding-skip" @click="finish">跳过并进入</button>
      </header>

      <div class="onboarding-progress" aria-label="引导进度">
        <i :class="{ active: step >= 0 }"></i>
        <i :class="{ active: step >= 1 }"></i>
        <i :class="{ active: step >= 2 }"></i>
        <i :class="{ active: step >= 3 }"></i>
      </div>

      <main v-if="step === 0" class="onboarding-content">
        <div class="onboarding-heading">
          <span><ShieldCheck :size="26" /></span>
          <div>
            <small>隐私与数据</small>
            <h1 id="onboarding-title">你的数据留在这台设备</h1>
            <p>Agent OS 只复用 Tsukuyomi Space 的登录身份，不在服务器保存你的工作区内容。</p>
          </div>
        </div>

        <div class="onboarding-facts">
          <div>
            <LockKeyhole :size="19" />
            <span><strong>账号隔离</strong><small>每个账号拥有独立的浏览器本地数据空间。</small></span>
          </div>
          <div>
            <HardDrive :size="19" />
            <span><strong>本地持久化</strong><small>对话、笔记、历史、API Key 和音乐凭据保存在本机。</small></span>
          </div>
          <div>
            <Bot :size="19" />
            <span><strong>按需发送</strong><small>调用模型、搜索或播放时，仅发送完成当前操作所需的数据。</small></span>
          </div>
        </div>

        <label v-if="legacyDataAvailable" class="onboarding-import">
          <input v-model="importLegacy" type="checkbox" />
          <span>
            <strong>导入此设备上的旧版 Agent OS 数据</strong>
            <small>旧数据默认不会自动归入任何账号。确认是你的数据后再导入。</small>
          </span>
        </label>
      </main>

      <main v-else-if="step === 1" class="onboarding-content">
        <div class="onboarding-heading">
          <span><KeyRound :size="26" /></span>
          <div>
            <small>模型 API</small>
            <h1 id="onboarding-title">连接你的模型服务</h1>
            <p>桌宠会直连此 API。服务商切换时会自动填写对应模型与地址，所有凭据仅保存在当前账号的本地空间。</p>
          </div>
        </div>

        <div class="onboarding-api-grid">
          <label>
            <span>服务商</span>
            <select :value="llm.llmProvider" @change="changeLlmProvider">
              <option v-for="provider in AGENT_LLM_PROVIDER_OPTIONS" :key="provider.value" :value="provider.value">
                {{ provider.label }}
              </option>
            </select>
          </label>
          <label>
            <span><Server :size="13" /> 模型</span>
            <input v-model="llm.llmModel" spellcheck="false" placeholder="gpt-4o-mini" />
          </label>
          <label class="onboarding-api-span">
            <span><Link2 :size="13" /> API URL</span>
            <input v-model="llm.llmApiUrl" type="url" spellcheck="false" autocomplete="url" placeholder="https://api.openai.com/v1/chat/completions" />
          </label>
          <label class="onboarding-api-span">
            <span><KeyRound :size="13" /> API Key</span>
            <input v-model="llm.llmApiKey" type="password" spellcheck="false" autocomplete="off" placeholder="sk-...（可稍后填写）" />
          </label>
        </div>
      </main>

      <main v-else-if="step === 2" class="onboarding-content">
        <div class="onboarding-heading">
          <span><Volume2 :size="26" /></span>
          <div>
            <small>本地语音</small>
            <h1 id="onboarding-title">让桌宠立即开口</h1>
            <p>Agent OS 会预热本机 GPT-SoVITS 权重，并使用流式音频驱动 Live2D 口型。语音配置同样只保存在当前设备。</p>
          </div>
        </div>

        <label class="onboarding-voice-toggle">
          <input v-model="tts.enabled" type="checkbox" />
          <span>
            <strong>启用本地 GPT-SoVITS</strong>
            <small>进入系统后自动预热；也可以稍后在设置中试听和修改完整参数。</small>
          </span>
        </label>

        <div class="onboarding-api-grid" :class="{ disabled: !tts.enabled }">
          <label class="onboarding-api-span">
            <span><Server :size="13" /> 本地 API URL</span>
            <input v-model="tts.apiUrl" type="url" spellcheck="false" autocomplete="url" :disabled="!tts.enabled" placeholder="http://localhost:9880/tts" />
          </label>
          <label>
            <span>输出语言</span>
            <select v-model="tts.textLang" :disabled="!tts.enabled">
              <option value="auto">自动检测，最快</option>
              <option value="zh">中文</option>
              <option value="ja">日文</option>
              <option value="en">英文</option>
            </select>
          </label>
          <label>
            <span>参考音频语言</span>
            <select v-model="tts.promptLang" :disabled="!tts.enabled">
              <option value="ja">日文</option>
              <option value="zh">中文</option>
              <option value="en">英文</option>
            </select>
          </label>
          <label class="onboarding-api-span">
            <span>参考音频路径</span>
            <input v-model="tts.refAudioPath" spellcheck="false" :disabled="!tts.enabled" placeholder="可留空，或填写 GPT-SoVITS 所在机器可访问的路径" />
          </label>
          <label class="onboarding-api-span">
            <span>参考音频文本</span>
            <input v-model="tts.promptText" spellcheck="false" :disabled="!tts.enabled" placeholder="参考音频中实际说出的文本" />
          </label>
        </div>

        <div class="onboarding-voice-note">
          <Zap :size="17" />
          <span><strong>低延迟建议</strong><small>先启动本地 API，再进入 Agent OS。保持“自动检测”可跳过额外翻译，首段音频会直接流式播放。</small></span>
        </div>
      </main>

      <main v-else class="onboarding-content">
        <div class="onboarding-heading">
          <span><Monitor :size="26" /></span>
          <div>
            <small>启动体验</small>
            <h1 id="onboarding-title">选择进入 Agent OS 的方式</h1>
            <p>这些选项以后都能在系统设置中更改。</p>
          </div>
        </div>

        <div class="onboarding-choice-grid">
          <button type="button" :class="{ selected: experience === 'desktop' }" @click="experience = 'desktop'">
            <Monitor :size="22" />
            <span><strong>桌面模式</strong><small>完整窗口、Dock 和全部应用。</small></span>
            <Check v-if="experience === 'desktop'" :size="17" />
          </button>
          <button type="button" :class="{ selected: experience === 'pet' }" @click="experience = 'pet'">
            <Bot :size="22" />
            <span><strong>桌宠模式</strong><small>右下角 Live2D 与精简对话框。</small></span>
            <Check v-if="experience === 'pet'" :size="17" />
          </button>
        </div>

        <div class="onboarding-theme" aria-label="界面主题">
          <span>界面主题</span>
          <div>
            <button type="button" :class="{ selected: theme === 'light' }" @click="theme = 'light'">浅色</button>
            <button type="button" :class="{ selected: theme === 'dark' }" @click="theme = 'dark'">深色</button>
          </div>
        </div>
      </main>

      <footer class="onboarding-footer">
        <button v-if="step > 0" type="button" class="onboarding-back" @click="step -= 1">
          <ArrowLeft :size="16" /> 返回
        </button>
        <span v-else></span>
        <button v-if="step < 3" type="button" class="onboarding-next" @click="step += 1">
          继续 <ArrowRight :size="16" />
        </button>
        <button v-else type="button" class="onboarding-next" @click="finish">
          完成设置 <Check :size="16" />
        </button>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.onboarding-screen {
  position: fixed;
  z-index: 10050;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    linear-gradient(rgb(7 15 28 / 34%), rgb(7 15 28 / 58%)),
    var(--ts-bg-image) center / cover no-repeat;
  backdrop-filter: blur(12px);
}

.onboarding-shell {
  display: grid;
  width: min(760px, 100%);
  height: min(680px, calc(100vh - 48px));
  min-height: 520px;
  max-height: calc(100vh - 48px);
  grid-template-rows: auto auto 1fr auto;
  overflow: hidden;
  border: 1px solid var(--os-border-strong);
  border-radius: 8px;
  color: var(--ts-text);
  background: color-mix(in srgb, var(--os-surface) 94%, transparent);
  box-shadow: 0 28px 90px rgb(0 0 0 / 34%);
}

.onboarding-header,
.onboarding-footer {
  display: flex;
  min-height: 68px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 28px;
}

.onboarding-header { border-bottom: 1px solid var(--os-border); }
.onboarding-footer { border-top: 1px solid var(--os-border); }

.onboarding-brand {
  display: flex;
  align-items: center;
  gap: 11px;
}

.onboarding-brand > span,
.onboarding-heading > span {
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--ts-accent);
}

.onboarding-brand > span {
  width: 34px;
  height: 34px;
  border-radius: 7px;
}

.onboarding-brand div,
.onboarding-heading div,
.onboarding-facts span,
.onboarding-choice-grid span,
.onboarding-import span {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.onboarding-brand strong { color: var(--ts-text-strong); font-size: 0.86rem; }
.onboarding-brand small,
.onboarding-heading small,
.onboarding-facts small,
.onboarding-choice-grid small,
.onboarding-import small { color: var(--ts-muted); }

.onboarding-skip,
.onboarding-back,
.onboarding-next,
.onboarding-choice-grid button,
.onboarding-theme button {
  border: 1px solid var(--os-border);
  border-radius: 7px;
  color: var(--ts-text);
  background: var(--os-control);
}

.onboarding-skip {
  min-height: 34px;
  padding: 0 12px;
  font-size: 0.75rem;
  font-weight: 750;
}

.onboarding-progress {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 14px 28px 0;
}

.onboarding-progress i {
  height: 3px;
  border-radius: 2px;
  background: var(--os-border);
}

.onboarding-progress i.active { background: var(--ts-accent); }

.onboarding-content {
  display: grid;
  align-content: start;
  min-height: 0;
  gap: 24px;
  overflow: auto;
  padding: 30px 44px 32px;
}

.onboarding-heading {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.onboarding-heading > span {
  width: 48px;
  height: 48px;
  border-radius: 8px;
}

.onboarding-heading h1 {
  margin: 0;
  color: var(--ts-text-strong);
  font-size: 1.55rem;
  line-height: 1.25;
  letter-spacing: 0;
}

.onboarding-heading p {
  max-width: 560px;
  margin: 4px 0 0;
  color: var(--ts-muted);
  font-size: 0.82rem;
  line-height: 1.65;
}

.onboarding-facts {
  display: grid;
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--os-border);
  border-radius: 8px;
  background: var(--os-border);
}

.onboarding-facts > div {
  display: grid;
  min-height: 66px;
  grid-template-columns: 26px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  color: var(--ts-accent);
  background: var(--os-panel);
}

.onboarding-facts strong,
.onboarding-choice-grid strong,
.onboarding-import strong { color: var(--ts-text-strong); font-size: 0.8rem; }
.onboarding-facts small,
.onboarding-choice-grid small,
.onboarding-import small { font-size: 0.71rem; line-height: 1.45; }

.onboarding-import {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: start;
  gap: 11px;
  border: 1px solid var(--os-border);
  border-radius: 8px;
  padding: 13px 15px;
  background: var(--os-panel);
  cursor: pointer;
}

.onboarding-import input { margin: 2px 0 0; accent-color: var(--ts-accent); }

.onboarding-api-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.onboarding-api-grid label {
  display: grid;
  min-width: 0;
  gap: 7px;
}

.onboarding-api-grid label > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--ts-muted);
  font-size: 0.72rem;
  font-weight: 800;
}

.onboarding-api-grid input,
.onboarding-api-grid select {
  min-width: 0;
  width: 100%;
  height: 40px;
  border: 1px solid var(--os-border);
  border-radius: 7px;
  padding: 0 11px;
  color: var(--ts-text);
  background: var(--os-control);
  outline: none;
}

.onboarding-api-grid input:focus,
.onboarding-api-grid select:focus { border-color: var(--ts-accent); }
.onboarding-api-grid select option { color: #15171a; background: #fff; }
.onboarding-api-span { grid-column: 1 / -1; }
.onboarding-api-grid.disabled { opacity: 0.58; }

.onboarding-voice-toggle,
.onboarding-voice-note {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: start;
  gap: 11px;
  border: 1px solid var(--os-border);
  border-radius: 8px;
  padding: 13px 15px;
  background: var(--os-panel);
}

.onboarding-voice-toggle { cursor: pointer; }
.onboarding-voice-toggle input { margin: 3px 0 0; accent-color: var(--ts-accent); }
.onboarding-voice-toggle span,
.onboarding-voice-note span { display: grid; min-width: 0; gap: 3px; }
.onboarding-voice-toggle strong,
.onboarding-voice-note strong { color: var(--ts-text-strong); font-size: 0.8rem; }
.onboarding-voice-toggle small,
.onboarding-voice-note small { color: var(--ts-muted); font-size: 0.71rem; line-height: 1.45; }
.onboarding-voice-note { color: var(--ts-accent); }

.onboarding-choice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.onboarding-choice-grid button {
  display: grid;
  min-height: 112px;
  grid-template-columns: 30px minmax(0, 1fr) 20px;
  align-items: start;
  gap: 10px;
  padding: 18px;
  text-align: left;
}

.onboarding-choice-grid button > svg:first-child { color: var(--ts-accent); }
.onboarding-choice-grid button.selected,
.onboarding-theme button.selected {
  border-color: color-mix(in srgb, var(--ts-accent) 72%, transparent);
  background: var(--os-active);
}

.onboarding-theme {
  display: flex;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px solid var(--os-border);
  padding-top: 18px;
  font-size: 0.78rem;
  font-weight: 800;
}

.onboarding-theme > div { display: flex; gap: 6px; }
.onboarding-theme button { min-width: 72px; min-height: 34px; font-size: 0.74rem; font-weight: 750; }

.onboarding-back,
.onboarding-next {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 16px;
  font-size: 0.76rem;
  font-weight: 800;
}

.onboarding-next {
  border-color: var(--ts-accent);
  color: #fff;
  background: var(--ts-accent);
}

@media (max-width: 680px) {
  .onboarding-screen { padding: 0; }
  .onboarding-shell { height: 100%; min-height: 100%; max-height: 100%; border: 0; border-radius: 0; }
  .onboarding-header,
  .onboarding-footer { padding-inline: 18px; }
  .onboarding-progress { padding-inline: 18px; }
  .onboarding-content { padding: 24px 18px; }
  .onboarding-api-grid { grid-template-columns: 1fr; }
  .onboarding-api-span { grid-column: auto; }
  .onboarding-choice-grid { grid-template-columns: 1fr; }
  .onboarding-heading { grid-template-columns: 40px minmax(0, 1fr); gap: 12px; }
  .onboarding-heading > span { width: 40px; height: 40px; }
  .onboarding-heading h1 { font-size: 1.25rem; }
}
</style>
