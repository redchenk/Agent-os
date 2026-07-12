<script setup>
import { Activity, Bot, Clapperboard, Gauge, KeyRound, Link2, MessageSquareText, Server } from 'lucide-vue-next';

defineProps({
  settings: { type: Object, required: true }
});
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
          <select v-model="settings.llmProvider">
            <option value="openai-compatible">OpenAI Compatible</option>
            <option value="openai">OpenAI</option>
            <option value="deepseek">DeepSeek</option>
            <option value="openrouter">OpenRouter</option>
            <option value="custom">Custom</option>
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
