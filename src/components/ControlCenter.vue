<script setup>
import { Bot, Gauge, Moon, Radio, Sun, Wifi, Zap, Cpu } from 'lucide-vue-next';

defineProps({
  doneToolCount: { type: Number, required: true },
  messageCount: { type: Number, required: true },
  settings: { type: Object, required: true },
  toolCount: { type: Number, required: true }
});

const emit = defineEmits(['toggle-theme']);
</script>

<template>
  <aside class="control-center acrylic-popover" @click.stop>
    <div class="quick-toggles">
      <div class="quick-status active"><Wifi :size="18" /> Wi-Fi<span>由系统管理</span></div>
      <button type="button" :class="{ active: settings.theme === 'dark' }" @click="emit('toggle-theme')">
        <component :is="settings.theme === 'dark' ? Moon : Sun" :size="18" />
        {{ settings.theme === 'dark' ? '深色' : '浅色' }}
      </button>
      <button type="button" :class="{ active: settings.fluentBlur }" @click="settings.fluentBlur = !settings.fluentBlur">
        <Gauge :size="18" />
        模糊
      </button>
      <button type="button" :class="{ active: settings.motion }" @click="settings.motion = !settings.motion">
        <Zap :size="18" />
        动画
      </button>
      <button type="button" :class="{ active: settings.petMode }" @click="settings.petMode = !settings.petMode">
        <Bot :size="18" />
        桌宠
      </button>
    </div>
    <div class="system-stats">
      <span><Radio :size="14" /> {{ messageCount }} events</span>
      <span><Cpu :size="14" /> {{ doneToolCount }}/{{ toolCount }} ready</span>
    </div>
  </aside>
</template>
