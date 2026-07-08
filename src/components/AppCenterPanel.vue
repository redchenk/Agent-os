<script setup>
import { computed, ref } from 'vue';
import { ExternalLink, Minus, Pin, PinOff, Search } from 'lucide-vue-next';
import SystemIcon from './SystemIcon.vue';

const props = defineProps({
  activeApp: { type: String, default: '' },
  apps: { type: Array, required: true },
  desktopIconKeys: { type: Array, default: () => [] },
  openApps: { type: Object, required: true }
});

const emit = defineEmits(['add-desktop-icon', 'close-app', 'focus-app', 'remove-desktop-icon']);
const searchQuery = ref('');

const filteredApps = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return props.apps;
  return props.apps.filter((app) => `${app.label} ${app.key}`.toLowerCase().includes(query));
});

const desktopIconKeySet = computed(() => new Set(props.desktopIconKeys));

function toggleDesktopIcon(app) {
  if (desktopIconKeySet.value.has(app.key)) {
    emit('remove-desktop-icon', app.key);
    return;
  }
  emit('add-desktop-icon', app.key);
}
</script>

<template>
  <section class="app-center-panel">
    <header class="app-center-header">
      <strong>应用中心</strong>
      <label class="app-center-search">
        <Search :size="15" />
        <input v-model="searchQuery" placeholder="搜索应用" />
      </label>
    </header>

    <div class="app-center-grid" aria-label="应用列表">
      <article
        v-for="app in filteredApps"
        :key="app.key"
        class="app-center-tile"
        :class="{ active: activeApp === app.key, running: openApps[app.key] }"
        @dblclick="emit('focus-app', app.key)"
      >
        <span class="app-center-icon">
          <SystemIcon :name="app.iconName" :size="78" />
        </span>
        <strong>{{ app.label }}</strong>
        <small>{{ openApps[app.key] ? '运行中' : '未打开' }}</small>
        <div class="app-center-actions">
          <button type="button" title="打开或切换" @click="emit('focus-app', app.key)">
            <ExternalLink :size="14" />
          </button>
          <button
            type="button"
            :title="desktopIconKeySet.has(app.key) ? '从桌面移除' : '放到桌面'"
            @click="toggleDesktopIcon(app)"
          >
            <component :is="desktopIconKeySet.has(app.key) ? PinOff : Pin" :size="14" />
          </button>
          <button
            v-if="app.key !== 'appCenter' && openApps[app.key]"
            type="button"
            title="关闭"
            @click="emit('close-app', app.key)"
          >
            <Minus :size="14" />
          </button>
        </div>
      </article>
      <p v-if="!filteredApps.length" class="app-center-empty">没有匹配的应用</p>
    </div>
  </section>
</template>
