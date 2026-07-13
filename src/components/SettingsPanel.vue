<script setup>
import { computed } from 'vue';
import { Activity, AudioLines, Bot, BookOpen, Clapperboard, Gauge, HardDrive, KeyRound, Link2, MessageSquareText, Play, Server, ShieldCheck, Zap } from 'lucide-vue-next';
import {
  AGENT_LLM_PROVIDER_OPTIONS,
  switchAgentLlmProvider
} from '../services/llmProviderProfiles';

const props = defineProps({
  settings: { type: Object, required: true },
  ttsSettings: { type: Object, required: true },
  ttsState: { type: Object, required: true }
});

const emit = defineEmits(['open-onboarding', 'test-tts']);

const ttsStatusLabel = computed(() => ({
  disabled: '未启用',
  loading: '正在生成语音',
  playing: '正在播放',
  error: '连接异常',
  idle: '已启用'
}[props.ttsState.status] || '待机'));

function changeLlmProvider(event) {
  Object.assign(props.settings, switchAgentLlmProvider(props.settings, event.target.value));
}
</script>

<template>
  <div class="settings-pane">
    <header class="settings-intro">
      <div>
        <span>系统设置</span>
        <strong>配置 Agent OS</strong>
        <p>管理智能体、模型服务和桌面体验。所有更改都会自动保存在本机。</p>
      </div>
      <small>自动保存</small>
    </header>

    <section class="settings-section settings-privacy-section">
      <header>
        <ShieldCheck :size="16" />
        <div>
          <strong>隐私与本地数据</strong>
          <small>当前账号使用独立的浏览器本地空间。</small>
        </div>
      </header>
      <div class="settings-privacy-status">
        <HardDrive :size="18" />
        <span>
          <strong>仅在本机持久化</strong>
          <small>对话、笔记、历史、API Key 与第三方音乐凭据不会保存到 Agent OS 服务器。</small>
        </span>
        <button type="button" @click="emit('open-onboarding')">
          <BookOpen :size="14" /> 重新查看引导
        </button>
      </div>
    </section>

    <section class="settings-section">
      <header>
        <Bot :size="16" />
        <div>
          <strong>系统身份</strong>
          <small>用于 Hermes 和 Live2D 服务识别当前 Agent。</small>
        </div>
      </header>
      <div class="settings-grid two-columns">
        <label>
          <span>Agent ID</span>
          <input v-model="settings.agent" autocomplete="off" />
        </label>
        <label>
          <span>Studio URL</span>
          <input v-model="settings.live2dStudioUrl" spellcheck="false" autocomplete="url" />
        </label>
      </div>
    </section>

    <section class="settings-section">
      <header>
        <KeyRound :size="16" />
        <div>
          <strong>模型 API</strong>
          <small>桌宠和 Hermes 共用这套模型配置。</small>
        </div>
      </header>
      <div class="settings-grid two-columns">
        <label>
          <span>服务商</span>
          <select :value="settings.llmProvider" @change="changeLlmProvider">
            <option v-for="provider in AGENT_LLM_PROVIDER_OPTIONS" :key="provider.value" :value="provider.value">
              {{ provider.label }}
            </option>
          </select>
        </label>
        <label>
          <span><Server :size="13" /> 模型</span>
          <input v-model="settings.llmModel" spellcheck="false" placeholder="gpt-4o-mini" />
        </label>
        <label class="settings-span-full">
          <span><Link2 :size="13" /> API URL</span>
          <input v-model="settings.llmApiUrl" spellcheck="false" autocomplete="url" placeholder="https://api.openai.com/v1/chat/completions" />
        </label>
        <label class="settings-span-full">
          <span><KeyRound :size="13" /> API Key</span>
          <input v-model="settings.llmApiKey" type="password" spellcheck="false" autocomplete="off" placeholder="sk-..." />
        </label>
      </div>
      <label>
        <span><MessageSquareText :size="13" /> 桌宠系统提示词</span>
        <textarea v-model="settings.petSystemPrompt" spellcheck="false"></textarea>
      </label>
      <p class="settings-help">API Key 仅保存在本机浏览器存储中，不会显示在界面上。</p>
    </section>

    <section class="settings-section settings-tts-section">
      <header>
        <AudioLines :size="16" />
        <div>
          <strong>本地语音</strong>
          <small>复用 Yachiyo Live2D Studio 的低延迟 GPT-SoVITS 流程。</small>
        </div>
      </header>

      <div class="settings-tts-toolbar">
        <label class="settings-tts-enable">
          <input v-model="ttsSettings.enabled" type="checkbox" />
          <span><strong>启用 GPT-SoVITS</strong><small>桌宠回复完成后立即流式播放并驱动口型</small></span>
        </label>
        <span class="settings-tts-state" :class="ttsState.status">
          <i aria-hidden="true"></i>{{ ttsStatusLabel }}
        </span>
        <button type="button" :disabled="!ttsSettings.enabled || ttsState.status === 'loading' || ttsState.status === 'playing'" @click="emit('test-tts')">
          <Play :size="14" /> 试听并预热
        </button>
      </div>

      <div class="settings-grid two-columns">
        <label class="settings-span-full">
          <span><Server :size="13" /> 本地 API URL</span>
          <input v-model="ttsSettings.apiUrl" type="url" spellcheck="false" autocomplete="url" placeholder="http://localhost:9880/tts" />
        </label>
        <label>
          <span>输出语言</span>
          <select v-model="ttsSettings.textLang">
            <option value="auto">自动检测，最快</option>
            <option value="zh">中文</option>
            <option value="ja">日文，必要时先翻译</option>
            <option value="en">英文</option>
            <option value="ko">韩文</option>
            <option value="yue">粤语</option>
          </select>
        </label>
        <label>
          <span>参考音频语言</span>
          <select v-model="ttsSettings.promptLang">
            <option value="ja">日文</option>
            <option value="zh">中文</option>
            <option value="en">英文</option>
            <option value="ko">韩文</option>
            <option value="yue">粤语</option>
          </select>
        </label>
        <label class="settings-span-full">
          <span>参考音频路径</span>
          <input v-model="ttsSettings.refAudioPath" spellcheck="false" placeholder="E:\voice\yachiyo.wav" />
        </label>
        <label class="settings-span-full">
          <span>参考音频文本</span>
          <input v-model="ttsSettings.promptText" spellcheck="false" placeholder="填写参考音频中实际说出的文本" />
        </label>
      </div>

      <details class="settings-tts-advanced">
        <summary><Zap :size="14" /> 模型权重</summary>
        <div class="settings-grid">
          <label>
            <span>GPT Weight</span>
            <input v-model="ttsSettings.gptWeightPath" spellcheck="false" placeholder="GPT_weights_v2ProPlus/yachiyo-v2pro-e15.ckpt" />
          </label>
          <label>
            <span>SoVITS Weight</span>
            <input v-model="ttsSettings.sovitsWeightPath" spellcheck="false" placeholder="SoVITS_weights_v2ProPlus/yachiyo-v2pro_e8_s456.pth" />
          </label>
        </div>
      </details>

      <p v-if="ttsState.error" class="settings-help settings-tts-error">{{ ttsState.error }}</p>
      <p v-else class="settings-help">本地服务需保持运行。自动或中文模式不会额外调用模型翻译，首段音频可直接开始输出。</p>
    </section>

    <section class="settings-section">
      <header>
        <Gauge :size="16" />
        <div>
          <strong>桌面体验</strong>
          <small>按需启用动画、模糊和桌宠能力。</small>
        </div>
      </header>
      <div class="toggle-list settings-toggle-list">
      <button type="button" :class="{ active: settings.autoLive2D }" @click="settings.autoLive2D = !settings.autoLive2D">
        <Clapperboard :size="15" />
        <span><strong>自动 Live2D</strong><small>让角色自动响应系统事件</small></span>
        <i aria-hidden="true"></i>
      </button>
      <button type="button" :class="{ active: settings.petMode }" @click="settings.petMode = !settings.petMode">
        <Bot :size="15" />
        <span><strong>桌宠模式</strong><small>在桌面右下角常驻运行</small></span>
        <i aria-hidden="true"></i>
      </button>
      <button type="button" :class="{ active: settings.fluentBlur }" @click="settings.fluentBlur = !settings.fluentBlur">
        <Gauge :size="15" />
        <span><strong>背景模糊</strong><small>增强窗口与桌面的层次</small></span>
        <i aria-hidden="true"></i>
      </button>
      <button type="button" :class="{ active: settings.motion }" @click="settings.motion = !settings.motion">
        <Activity :size="15" />
        <span><strong>界面动画</strong><small>启用窗口和控件动效</small></span>
        <i aria-hidden="true"></i>
      </button>
      </div>
    </section>
  </div>
</template>
