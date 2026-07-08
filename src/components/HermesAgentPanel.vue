<script setup>
import {
  Bot,
  BrainCircuit,
  Cable,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clapperboard,
  FileText,
  FolderOpen,
  MessageSquareText,
  Paperclip,
  Play,
  Plus,
  Search,
  Send,
  Settings2,
  Square,
  SquarePen,
  Terminal,
  Unplug,
  X,
  Zap
} from 'lucide-vue-next';
import { ref } from 'vue';
import { formatBytes, formatDate, formatTime, normalizeWorkspacePath } from '../modules/agentOs/formatters';
import { readablePacketTitle } from '../modules/hermes/hermesPackets';

defineProps({
  activeConversationId: { type: String, default: '' },
  activeModel: { type: Object, required: true },
  agentModels: { type: Array, required: true },
  agentModes: { type: Array, required: true },
  attachedItems: { type: Array, required: true },
  composerDragging: { type: Boolean, default: false },
  composerHasContent: { type: Boolean, default: false },
  connectionLabel: { type: String, required: true },
  currentRequestId: { type: String, default: '' },
  displayedMessages: { type: Array, required: true },
  displayedProcessEvents: { type: Array, required: true },
  isConnected: { type: Boolean, default: false },
  normalizedSidebarSearchQuery: { type: String, default: '' },
  processEvents: { type: Array, required: true },
  projects: { type: Array, required: true },
  conversations: { type: Array, required: true },
  settings: { type: Object, required: true },
  socketState: { type: String, required: true },
  workspaceName: { type: String, required: true }
});

const prompt = defineModel('prompt', { type: String, required: true });
const mode = defineModel('mode', { type: String, required: true });
const sidebarSearchOpen = defineModel('sidebarSearchOpen', { type: Boolean, required: true });
const sidebarSearchQuery = defineModel('sidebarSearchQuery', { type: String, required: true });
const thinkingEnabled = defineModel('thinkingEnabled', { type: Boolean, required: true });
const selectedModel = defineModel('selectedModel', { type: String, required: true });
const modelMenuOpen = defineModel('modelMenuOpen', { type: Boolean, required: true });
const detailExpanded = defineModel('detailExpanded', { type: Boolean, required: true });

const emit = defineEmits([
  'agent-file-change',
  'add-context-reference',
  'composer-dragleave',
  'composer-dragover',
  'composer-drop',
  'connect',
  'create-project',
  'disconnect',
  'focus-settings',
  'focus-stream',
  'load-conversation',
  'paste',
  'remove-attached-item',
  'select-project',
  'send-prompt',
  'start-new-conversation',
  'start-project-conversation',
  'stop-run',
  'toggle-sidebar-search'
]);

const agentFileInputRef = ref(null);

function chooseModel(model) {
  selectedModel.value = model.id;
  modelMenuOpen.value = false;
}
</script>

<template>
  <div class="codex-agent-app">
    <aside class="codex-agent-sidebar">
      <div class="codex-side-primary">
        <button type="button" @click="emit('start-new-conversation')"><MessageSquareText :size="16" /> 新对话</button>
        <button type="button" :class="{ active: sidebarSearchOpen }" @click="emit('toggle-sidebar-search')"><Search :size="16" /> 搜索</button>
        <button type="button" @click="emit('focus-stream')"><Terminal :size="16" /> 事件流</button>
        <button type="button" @click="emit('focus-settings')"><Settings2 :size="16" /> 设置</button>
      </div>

      <label v-if="sidebarSearchOpen" class="codex-side-search">
        <Search :size="15" />
        <input v-model="sidebarSearchQuery" autofocus placeholder="搜索项目、对话或消息" @keydown.esc="emit('toggle-sidebar-search')" />
      </label>

      <div class="codex-side-section">
        <div class="codex-side-heading">
          <span>项目</span>
          <button class="codex-side-heading-action" type="button" title="新建项目" @click="emit('create-project')">
            <Plus :size="14" />
          </button>
        </div>
        <div
          v-for="project in projects"
          :key="project.path"
          class="codex-side-item"
          :class="{ active: normalizeWorkspacePath(settings.workspace) === project.path }"
        >
          <button class="codex-side-item-main" type="button" @click="emit('select-project', project)">
            <FolderOpen :size="15" />
            <strong>{{ project.label }}</strong>
            <small>{{ project.conversationCount }} 个对话</small>
          </button>
          <button class="codex-side-item-action" type="button" title="在此项目中新建对话" @click.stop="emit('start-project-conversation', project)">
            <SquarePen :size="14" />
          </button>
        </div>
        <p v-if="!projects.length" class="codex-side-empty">没有匹配项目</p>
      </div>

      <div class="codex-side-section conversations">
        <div class="codex-side-heading">
          <span>对话</span>
          <button class="codex-side-heading-action" type="button" title="新建对话" @click="emit('start-new-conversation')">
            <Plus :size="14" />
          </button>
        </div>
        <div
          v-for="conversation in conversations"
          :key="conversation.id"
          class="codex-side-item"
          :class="{ active: activeConversationId === conversation.id }"
        >
          <button class="codex-side-item-main" type="button" @click="emit('load-conversation', conversation)">
            <MessageSquareText :size="15" />
            <strong>{{ conversation.title }}</strong>
            <small>{{ formatDate(conversation.updatedAt) }}</small>
          </button>
        </div>
        <p v-if="!conversations.length" class="codex-side-empty">
          {{ normalizedSidebarSearchQuery ? '没有匹配对话' : '暂无对话' }}
        </p>
      </div>

      <div class="codex-side-footer">
        <span class="status-pill" :class="socketState">
          <Circle :size="8" fill="currentColor" />
          {{ connectionLabel }}
        </span>
        <small>{{ workspaceName }}</small>
      </div>
    </aside>

    <section class="codex-agent-main">
      <header class="codex-agent-header">
        <div>
          <span><Bot :size="17" /> Hermes Agent</span>
          <strong>设计纯前端 Agent OS</strong>
        </div>
        <div class="codex-agent-connect">
          <label>
            <Cable :size="14" />
            <input v-model="settings.wsUrl" aria-label="Hermes WebSocket URL" spellcheck="false" />
          </label>
          <button v-if="!isConnected" class="accent-btn" type="button" @click="emit('connect')">
            <Play :size="15" />
            Connect
          </button>
          <button v-else class="soft-btn" type="button" @click="emit('disconnect')">
            <Unplug :size="15" />
            Disconnect
          </button>
        </div>
      </header>

      <main class="codex-chat-scroll" aria-label="Hermes conversation">
        <article v-for="message in displayedMessages" :key="message.id" class="codex-message" :class="message.type">
          <span class="codex-message-icon">
            <component :is="message.type === 'user' ? MessageSquareText : message.type === 'live2d' ? Clapperboard : message.type === 'error' ? Zap : Bot" :size="16" />
          </span>
          <div class="codex-message-content">
            <header>
              <strong>{{ message.title || readablePacketTitle(message.type) }}</strong>
              <time>{{ formatTime(message.at) }}</time>
            </header>
            <p>{{ message.text }}</p>
          </div>
        </article>
        <p v-if="normalizedSidebarSearchQuery && !displayedMessages.length" class="codex-chat-empty">没有匹配的消息</p>

        <section v-if="processEvents.length" class="codex-process-panel" :class="{ open: detailExpanded }">
          <button type="button" class="codex-process-toggle" @click="detailExpanded = !detailExpanded">
            <span><Terminal :size="15" /> 处理详情</span>
            <small>{{ processEvents.length }} 条</small>
            <ChevronDown :size="15" />
          </button>
          <div v-if="detailExpanded" class="codex-process-list">
            <article v-for="event in displayedProcessEvents" :key="event.id">
              <header>
                <strong>{{ event.title }}</strong>
                <time>{{ formatTime(event.at) }}</time>
              </header>
              <p>{{ event.text }}</p>
            </article>
            <p v-if="normalizedSidebarSearchQuery && !displayedProcessEvents.length" class="codex-process-empty">没有匹配的处理详情</p>
          </div>
        </section>
      </main>

      <section
        class="codex-composer"
        :class="{ dragging: composerDragging }"
        @dragover="emit('composer-dragover', $event)"
        @dragleave="emit('composer-dragleave', $event)"
        @drop="emit('composer-drop', $event)"
      >
        <div v-if="attachedItems.length" class="codex-attachment-strip">
          <article v-for="item in attachedItems" :key="item.id" class="attachment-card" :class="item.status">
            <img v-if="item.preview" :src="item.preview" :alt="item.name" />
            <span v-else><FileText :size="16" /></span>
            <div>
              <strong>{{ item.name }}</strong>
              <small>{{ item.detail || item.reference || (item.kind === 'paste' ? 'Pasted text' : formatBytes(item.size)) }}</small>
            </div>
            <button type="button" title="Remove" @click="emit('remove-attached-item', item.id)"><X :size="12" /></button>
          </article>
        </div>

        <textarea
          v-model="prompt"
          placeholder="Ask Hermes to build, inspect, edit, or explain..."
          @paste="emit('paste', $event)"
          @keydown.ctrl.enter.prevent="emit('send-prompt')"
        ></textarea>

        <div class="codex-composer-bar">
          <div class="codex-composer-left">
            <input ref="agentFileInputRef" class="hidden-file-input" type="file" multiple @change="emit('agent-file-change', $event)" />
            <button class="soft-btn icon-btn" type="button" title="上传文本/代码文件" @click="agentFileInputRef?.click()"><Paperclip :size="15" /></button>
            <button class="soft-btn icon-btn" type="button" title="添加 Hermes @file/@folder 引用" @click="emit('add-context-reference')"><FileText :size="15" /></button>
            <button class="soft-btn" type="button" :class="{ active: thinkingEnabled }" @click="thinkingEnabled = !thinkingEnabled">
              <BrainCircuit :size="15" />
              Think
            </button>
            <div class="mode-switch compact">
              <button v-for="item in agentModes" :key="item.key" type="button" :class="{ active: mode === item.key }" @click="mode = item.key">
                {{ item.label }}
              </button>
            </div>
          </div>

          <div class="codex-composer-right">
            <button class="model-picker" type="button" @click="modelMenuOpen = !modelMenuOpen">
              {{ activeModel.name }}
              <ChevronDown :size="14" />
            </button>
            <div v-if="modelMenuOpen" class="model-menu">
              <button v-for="model in agentModels" :key="model.id" type="button" @click="chooseModel(model)">
                <span>
                  <strong>{{ model.name }}</strong>
                  <small>{{ model.detail }}</small>
                </span>
                <CheckCircle2 v-if="selectedModel === model.id" :size="15" />
              </button>
            </div>
            <button v-if="currentRequestId" class="danger-btn" type="button" @click="emit('stop-run')"><Square :size="14" />Stop</button>
            <button class="accent-btn send-agent-btn" type="button" :disabled="!composerHasContent" @click="emit('send-prompt')">
              <Send :size="15" />
            </button>
          </div>
        </div>
      </section>
    </section>
  </div>
</template>
