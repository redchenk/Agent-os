<script setup>
import { RefreshCw, Send, WandSparkles } from 'lucide-vue-next';
import { ref } from 'vue';

defineProps({
  lastLive2DIntent: { type: Object, required: true },
  live2d: { type: Object, required: true },
  live2dDragging: { type: Boolean, default: false },
  presets: { type: Array, required: true }
});

const emit = defineEmits(['model-dblclick', 'model-drag-start', 'model-wheel', 'preset', 'send-intent']);
const stageRef = ref(null);

defineExpose({
  getStageElement: () => stageRef.value
});
</script>

<template>
  <div
    ref="stageRef"
    class="yachiyo-stage live2d-runtime-stage"
    :class="{ dragging: live2dDragging }"
    title="拖拽移动 Live2D，滚轮缩放，双击还原"
    @pointerdown.stop="emit('model-drag-start', $event)"
    @wheel.stop.prevent="emit('model-wheel', $event)"
    @dblclick.stop="emit('model-dblclick')"
  >
    <div id="live2d-container" class="live2d-model" :class="{ ready: live2d.ready.value }"></div>
    <div v-if="live2d.loading.value" class="live2d-runtime-status">
      <RefreshCw :size="18" />
      <span>Loading Live2D</span>
    </div>
    <div v-else-if="live2d.error.value" class="live2d-runtime-error">
      {{ live2d.error.value }}
    </div>
  </div>

  <div class="intent-line">
    <strong>{{ lastLive2DIntent.emotion }}</strong>
    <span>{{ lastLive2DIntent.actions?.map((item) => item.type).join(' + ') }}</span>
  </div>

  <div class="preset-row">
    <button v-for="preset in presets" :key="preset.key" type="button" @click="emit('preset', preset)">
      <WandSparkles :size="14" />
      {{ preset.label }}
    </button>
  </div>

  <button class="soft-btn send-intent" type="button" @click="emit('send-intent')">
    <Send :size="14" />
    回传意图
  </button>
</template>
