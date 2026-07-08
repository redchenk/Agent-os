<script setup>
import { Activity, Clapperboard, Gauge } from 'lucide-vue-next';

defineProps({
  settings: { type: Object, required: true }
});
</script>

<template>
  <div class="settings-pane">
    <label>
      <span>Agent ID</span>
      <input v-model="settings.agent" />
    </label>
    <label>
      <span>Studio URL</span>
      <input v-model="settings.live2dStudioUrl" spellcheck="false" />
    </label>
    <div class="toggle-list">
      <button type="button" :class="{ active: settings.autoLive2D }" @click="settings.autoLive2D = !settings.autoLive2D">
        <Clapperboard :size="15" />
        Auto Live2D
      </button>
      <button type="button" :class="{ active: settings.fluentBlur }" @click="settings.fluentBlur = !settings.fluentBlur">
        <Gauge :size="15" />
        Blur
      </button>
      <button type="button" :class="{ active: settings.motion }" @click="settings.motion = !settings.motion">
        <Activity :size="15" />
        Motion
      </button>
    </div>
  </div>
</template>
