<script setup>
import { Bot, Clapperboard, MessageSquareText, Zap } from 'lucide-vue-next';
import { formatTime } from '../modules/agentOs/formatters';
import { readablePacketTitle } from '../modules/hermes/hermesPackets';

defineProps({
  messages: { type: Array, required: true }
});
</script>

<template>
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
