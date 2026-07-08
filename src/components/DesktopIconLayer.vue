<script setup>
import { computed, ref } from 'vue';
import SystemIcon from './SystemIcon.vue';

const props = defineProps({
  icons: { type: Array, required: true }
});

const emit = defineEmits(['focus-app', 'move-icon']);

const iconWidth = 86;
const iconHeight = 92;
const gridX = 104;
const gridY = 104;
const edge = 24;
const dockClearance = 118;
const dragThreshold = 4;

const dragState = ref(null);

const draggingKey = computed(() => dragState.value?.key || '');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function desktopBounds(target) {
  const desktop = target?.closest?.('.desktop');
  const rect = desktop?.getBoundingClientRect?.();
  return {
    width: Math.max(rect?.width || window.innerWidth || 0, 320),
    height: Math.max(rect?.height || window.innerHeight || 0, 420)
  };
}

function boundedPosition(position, bounds) {
  return {
    x: clamp(position.x, edge, bounds.width - iconWidth - edge),
    y: clamp(position.y, edge, bounds.height - iconHeight - dockClearance)
  };
}

function snapPosition(position, bounds) {
  const snapped = {
    x: edge + Math.round((position.x - edge) / gridX) * gridX,
    y: edge + Math.round((position.y - edge) / gridY) * gridY
  };
  return boundedPosition(snapped, bounds);
}

function iconPosition(icon) {
  if (dragState.value?.key === icon.key) {
    return {
      left: `${dragState.value.previewX}px`,
      top: `${dragState.value.previewY}px`
    };
  }
  return {
    left: `${icon.x}px`,
    top: `${icon.y}px`
  };
}

function startIconDrag(event, icon) {
  if (event.button !== 0) return;
  const bounds = desktopBounds(event.currentTarget);
  const initial = boundedPosition({ x: icon.x, y: icon.y }, bounds);
  dragState.value = {
    key: icon.key,
    pointerId: event.pointerId,
    startPointerX: event.clientX,
    startPointerY: event.clientY,
    startX: initial.x,
    startY: initial.y,
    previewX: initial.x,
    previewY: initial.y,
    moved: false
  };
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function moveIconDrag(event) {
  const state = dragState.value;
  if (!state || state.pointerId !== event.pointerId) return;
  const bounds = desktopBounds(event.currentTarget);
  const dx = event.clientX - state.startPointerX;
  const dy = event.clientY - state.startPointerY;
  if (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold) state.moved = true;
  const next = boundedPosition({ x: state.startX + dx, y: state.startY + dy }, bounds);
  state.previewX = next.x;
  state.previewY = next.y;
}

function endIconDrag(event) {
  const state = dragState.value;
  if (!state || state.pointerId !== event.pointerId) return;
  const bounds = desktopBounds(event.currentTarget);
  const moved = state.moved;
  const next = snapPosition({ x: state.previewX, y: state.previewY }, bounds);
  dragState.value = null;
  if (moved) {
    emit('move-icon', state.key, next);
    return;
  }
  emit('focus-app', state.key);
}

function cancelIconDrag(event) {
  if (dragState.value?.pointerId === event.pointerId) dragState.value = null;
}
</script>

<template>
  <section class="desktop-icons" aria-label="桌面应用">
    <button
      v-for="icon in props.icons"
      :key="icon.key"
      class="desktop-shortcut"
      :class="{ dragging: draggingKey === icon.key }"
      type="button"
      :style="iconPosition(icon)"
      :aria-label="`打开${icon.label}`"
      @pointerdown="startIconDrag($event, icon)"
      @pointermove="moveIconDrag"
      @pointerup="endIconDrag"
      @pointercancel="cancelIconDrag"
      @keydown.enter.prevent="emit('focus-app', icon.key)"
      @keydown.space.prevent="emit('focus-app', icon.key)"
    >
      <SystemIcon :name="icon.iconName" :size="54" />
      <strong>{{ icon.label }}</strong>
    </button>
  </section>
</template>
