<script setup>
import { Bot, Clapperboard, MessageSquareText, Radio, Zap } from 'lucide-vue-next';
import { formatTime } from '../modules/agentOs/formatters';
import { readablePacketTitle } from '../modules/hermes/hermesPackets';

defineProps({
  messages: { type: Array, required: true }
});
</script>

<template>
  <section v-if="!messages.length" class="stream-empty">
    <span><Radio :size="20" /></span>
    <strong>等待事件</strong>
    <p>Hermes、桌宠和应用调用产生的实时事件会显示在这里。</p>
  </section>
  <article v-for="message in messages" :key="message.id" class="stream-message" :class="message.type">
    <span class="message-dot">
      <component :is="message.type === 'user' ? MessageSquareText : message.type === 'live2d' ? Clapperboard : message.type === 'error' ? Zap : Bot" :size="15" />
    </span>
    <div>
      <strong>{{ message.title || readablePacketTitle(message.type) }}</strong>
      <time>{{ formatTime(message.at) }}</time>
      <p>{{ message.text }}</p>
    </div>
  </article>
</template>
