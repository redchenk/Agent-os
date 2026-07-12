<script setup>
import { computed } from 'vue';
import { Circle } from 'lucide-vue-next';
import { formatDate, formatTime } from '../modules/agentOs/formatters';
import SystemIcon from './SystemIcon.vue';

const pinnedDockKeys = ['agent', 'browser', 'notepad', 'music', 'appCenter'];

const props = defineProps({
  activeApp: { type: String, default: '' },
  apps: { type: Array, required: true },
  connectionLabel: { type: String, required: true },
  isConnected: { type: Boolean, default: false },
  now: { type: Number, required: true },
  openApps: { type: Object, required: true },
  petMode: { type: Boolean, default: false },
  socketState: { type: String, required: true },
  startOpen: { type: Boolean, default: false }
});

const emit = defineEmits(['focus-app', 'toggle-connection', 'toggle-control', 'toggle-pet-mode', 'toggle-start']);

const pinnedApps = computed(() => (
  props.apps.filter((app) => pinnedDockKeys.includes(app.key))
));

const runningOnlyApps = computed(() => (
  props.apps.filter((app) => !pinnedDockKeys.includes(app.key) && props.openApps[app.key])
));
</script>

<template>
  <nav class="taskbar acrylic" aria-label="Dock">
    <button
      class="taskbar-btn start"
      type="button"
      :class="{ active: startOpen }"
      title="打开启动台"
      @click.stop="emit('toggle-start')"
    >
      <SystemIcon name="start" :size="46" />
    </button>

    <div class="taskbar-apps" aria-label="Dock apps">
      <TransitionGroup name="dock-app" tag="div" class="taskbar-app-section pinned">
        <button
          v-for="app in pinnedApps"
          :key="app.key"
          class="taskbar-btn"
          :class="{ active: activeApp === app.key, running: openApps[app.key] }"
          :data-app="app.key"
          type="button"
          :title="app.label"
          @click.stop="emit('focus-app', app.key)"
        >
          <SystemIcon :name="app.iconName" :size="46" />
        </button>
      </TransitionGroup>

      <span v-if="runningOnlyApps.length" class="taskbar-divider" aria-hidden="true"></span>

      <TransitionGroup name="dock-app" tag="div" class="taskbar-app-section running-only">
        <button
          v-for="app in runningOnlyApps"
          :key="app.key"
          class="taskbar-btn dock-transient"
          :class="{ active: activeApp === app.key, running: openApps[app.key] }"
          :data-app="app.key"
          type="button"
          :title="app.label"
          @click.stop="emit('focus-app', app.key)"
        >
          <SystemIcon :name="app.iconName" :size="46" />
        </button>
      </TransitionGroup>
    </div>

    <button class="taskbar-status" type="button" :class="socketState" :title="isConnected ? '断开 Hermes' : '连接 Hermes'" @click.stop="emit('toggle-connection')">
      <Circle :size="8" fill="currentColor" />
      {{ connectionLabel }}
    </button>

    <button class="taskbar-status pet-toggle" type="button" :class="{ open: petMode }" :title="petMode ? '关闭桌宠模式' : '开启桌宠模式'" @click.stop="emit('toggle-pet-mode')">
      桌宠
    </button>

    <button class="taskbar-clock" type="button" title="打开控制中心" @click.stop="emit('toggle-control')">
      <span>{{ formatTime(now) }}</span>
      <small>{{ formatDate(now) }}</small>
    </button>
  </nav>
</template>
