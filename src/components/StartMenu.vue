<script setup>
import { Search } from 'lucide-vue-next';
import SystemIcon from './SystemIcon.vue';

defineProps({
  apps: { type: Array, required: true }
});

const searchQuery = defineModel('searchQuery', { type: String, required: true });
const emit = defineEmits(['focus-app', 'inspect-project', 'open-stream']);
</script>

<template>
  <aside class="start-menu acrylic-popover" @click.stop>
    <label class="search-box">
      <Search :size="16" />
      <input v-model="searchQuery" placeholder="搜索应用、命令和记忆" />
    </label>

    <div class="start-section">
      <div class="section-title">
        <strong>已固定</strong>
        <button type="button">所有应用</button>
      </div>
      <div class="start-grid">
        <button v-for="app in apps" :key="app.key" type="button" @click="emit('focus-app', app.key)">
          <SystemIcon :name="app.iconName" :size="36" />
          {{ app.label }}
        </button>
      </div>
    </div>

    <div class="recommended-list">
      <strong>推荐项目</strong>
      <button type="button" @click="emit('inspect-project')">检查项目结构</button>
      <button type="button" @click="emit('open-stream')">查看事件流</button>
    </div>
  </aside>
</template>
