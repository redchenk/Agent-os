<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  live2d: { type: Object, required: true },
  live2dDragging: { type: Boolean, default: false },
  petBusy: { type: Boolean, default: false },
  petError: { type: String, default: '' },
  petReply: { type: String, default: '' }
});

const prompt = defineModel('prompt', { type: String, required: true });

const emit = defineEmits([
  'model-dblclick',
  'model-drag-start',
  'model-wheel',
  'send-prompt'
]);

const stageRef = ref(null);
const canSendPrompt = computed(() => Boolean(prompt.value.trim()) && !props.petBusy);
const dialogueText = computed(() => {
  if (props.petBusy) return '正在思考...';
  return props.petError || props.petReply || '我在这里。';
});

defineExpose({
  getStageElement: () => stageRef.value
});

function submitPrompt() {
  if (!canSendPrompt.value) return;
  emit('send-prompt');
}
</script>

<template>
  <section class="pet-mode-overlay" aria-label="Agent OS 常驻桌宠">
    <div
      ref="stageRef"
      class="pet-live2d-stage live2d-runtime-stage"
      :class="{ dragging: live2dDragging }"
      @pointerdown.stop="emit('model-drag-start', $event)"
      @wheel.stop.prevent="emit('model-wheel', $event)"
      @dblclick.stop="emit('model-dblclick')"
    >
      <div id="live2d-container" class="live2d-model pet-live2d-model" :class="{ ready: live2d.ready.value }"></div>
      <div v-if="live2d.loading.value" class="live2d-runtime-status">
        <span>Loading Live2D</span>
      </div>
      <div v-else-if="live2d.error.value" class="live2d-runtime-error">
        {{ live2d.error.value }}
      </div>
    </div>

    <form class="pet-dialogue-box" @submit.prevent="submitPrompt">
      <p :class="{ error: petError }">{{ dialogueText }}</p>
      <textarea
        v-model="prompt"
        rows="2"
        placeholder="和我说点什么..."
        @keydown.enter.exact.prevent="submitPrompt"
      ></textarea>
    </form>
  </section>
</template>
