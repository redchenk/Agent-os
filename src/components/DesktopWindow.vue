<script setup>
defineProps({
  active: { type: Boolean, default: false },
  appKey: { type: String, required: true },
  resizeDirections: { type: Array, required: true },
  styleValue: { type: Object, required: true },
  windowClass: { type: String, default: '' }
});

const emit = defineEmits(['drag', 'focus', 'resize']);
</script>

<template>
  <article
    class="os-window"
    :class="[windowClass, { active }]"
    :style="styleValue"
    @pointerdown="emit('focus')"
  >
    <header class="window-titlebar" @pointerdown.prevent="emit('drag', $event)">
      <span class="window-title"><slot name="title" /></span>
      <div class="window-actions" @pointerdown.stop>
        <slot name="actions" />
      </div>
    </header>

    <slot />

    <span
      v-for="direction in resizeDirections"
      :key="direction"
      class="resize-handle"
      :class="direction"
      @pointerdown.stop.prevent="emit('resize', $event, direction)"
    ></span>
  </article>
</template>
