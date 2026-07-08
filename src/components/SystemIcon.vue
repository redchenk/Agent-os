<script setup>
import { computed } from 'vue';
import { systemIconAssets, systemIconDarkAssets } from '../modules/agentOs/systemIcons';
import { assetUrl } from '../utils/assetUrl';

const props = defineProps({
  name: { type: String, default: '' },
  size: { type: [Number, String], default: 44 }
});

const iconSource = computed(() => {
  const source = systemIconAssets[props.name] || '';
  return source ? assetUrl(source) : '';
});

const darkIconSource = computed(() => {
  const source = systemIconDarkAssets[props.name] || '';
  return source ? assetUrl(source) : '';
});

const iconStyle = computed(() => {
  const numericSize = Number.parseFloat(String(props.size));
  const size = Number.isFinite(numericSize) ? `${numericSize}px` : String(props.size);
  return { '--system-icon-size': size };
});
</script>

<template>
  <span class="system-icon" :style="iconStyle" aria-hidden="true">
    <img
      v-if="iconSource"
      class="system-icon-image system-icon-image--light"
      :src="iconSource"
      alt=""
      draggable="false"
    />
    <img
      v-if="darkIconSource"
      class="system-icon-image system-icon-image--dark"
      :src="darkIconSource"
      alt=""
      draggable="false"
    />
    <span v-else class="system-icon-fallback">
      <slot />
    </span>
  </span>
</template>
