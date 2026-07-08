<script setup>
import { Maximize2, Minus, RefreshCw, RotateCcw, X } from 'lucide-vue-next';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useAgentComposer } from './composables/useAgentComposer';
import { useAgentWorkspace } from './composables/useAgentWorkspace';
import { useDesktopIcons } from './composables/useDesktopIcons';
import { useLive2DWindow } from './composables/useLive2DWindow';
import { useWindowManager } from './composables/useWindowManager';
import { useLive2D } from './composables/room/useLive2D';
import AppCenterPanel from './components/AppCenterPanel.vue';
import BrowserPanel from './components/BrowserPanel.vue';
import CalculatorPanel from './components/CalculatorPanel.vue';
import ClockPanel from './components/ClockPanel.vue';
import DesktopWindow from './components/DesktopWindow.vue';
import DesktopIconLayer from './components/DesktopIconLayer.vue';
import ControlCenter from './components/ControlCenter.vue';
import HermesAgentPanel from './components/HermesAgentPanel.vue';
import NotepadPanel from './components/NotepadPanel.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import StartMenu from './components/StartMenu.vue';
import StreamPanel from './components/StreamPanel.vue';
import SystemIcon from './components/SystemIcon.vue';
import Taskbar from './components/Taskbar.vue';
import WeatherPanel from './components/WeatherPanel.vue';
import YachiyoPanel from './components/YachiyoPanel.vue';
import { HermesSocketClient } from './services/hermesSocket';
import { dispatchRoomLive2D } from './services/room/live2dControl';
import { extractLive2DIntent, normalizeLive2DIntent } from './services/live2dBridge';
import {
  DEFAULT_HERMES_DESKTOP_URL,
  DEFAULT_DESKTOP_ICON_STATE,
  DEFAULT_LIVE2D_MODEL,
  DEFAULT_WINDOW_STATE,
  DESKTOP_ICONS_STORAGE_KEY,
  LEGACY_HERMES_DESKTOP_URLS,
  LIVE2D_MODEL_STORAGE_KEY,
  STORAGE_KEY,
  WINDOWS_STORAGE_KEY,
  agentModels,
  agentModes,
  defaultSettings,
  live2dPresets
} from './modules/agentOs/config';
import {
  normalizeWorkspacePath,
  workspaceLabelFromPath
} from './modules/agentOs/formatters';
import {
  finalResultText,
  isFinalPacket,
  isStreamingPacket,
  isToolResultPayload,
  packetText,
  readablePacketTitle,
  stringifyPacket
} from './modules/hermes/hermesPackets';

const apps = [
  { key: 'agent', label: 'Hermes', iconName: 'agent' },
  { key: 'browser', label: '浏览器', iconName: 'browser' },
  { key: 'notepad', label: '记事本', iconName: 'notepad' },
  { key: 'calculator', label: '计算器', iconName: 'calculator' },
  { key: 'clock', label: '时钟', iconName: 'clock' },
  { key: 'weather', label: '天气', iconName: 'weather' },
  { key: 'appCenter', label: '应用中心', iconName: 'appCenter' },
  { key: 'yachiyo', label: 'Yachiyo', iconName: 'yachiyo' },
  { key: 'stream', label: 'Stream', iconName: 'stream' },
  { key: 'settings', label: '设置', iconName: 'settings' }
];

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    const savedWsUrl = String(saved.wsUrl || '').replace(/\/+$/, '');
    if (LEGACY_HERMES_DESKTOP_URLS.has(savedWsUrl)) saved.wsUrl = DEFAULT_HERMES_DESKTOP_URL;
    return { ...defaultSettings, ...saved };
  } catch (_) {
    return { ...defaultSettings };
  }
}

function isLegacyHermesDesktopUrl(url) {
  return LEGACY_HERMES_DESKTOP_URLS.has(String(url || '').trim().replace(/\/+$/, ''));
}

function migrateLegacyHermesDesktopUrl() {
  if (isLegacyHermesDesktopUrl(settings.wsUrl)) settings.wsUrl = DEFAULT_HERMES_DESKTOP_URL;
}

const settings = reactive(readSettings());
migrateLegacyHermesDesktopUrl();
const mode = ref('operate');
const socketState = ref('idle');
const currentRequestId = ref('');
const prompt = ref('帮我检查这个前端 Agent OS 的设计，并给出下一步执行计划。');
const searchQuery = ref('');
const sidebarSearchOpen = ref(false);
const sidebarSearchQuery = ref('');
const startOpen = ref(false);
const controlOpen = ref(false);
const {
  activeApp,
  closeApp,
  focusApp,
  maximizeWindow,
  openApps,
  resetWindow,
  resizeDirections,
  startWindowDrag,
  startWindowResize,
  windowStyle
} = useWindowManager({
  apps,
  defaultWindowState: DEFAULT_WINDOW_STATE,
  storageKey: WINDOWS_STORAGE_KEY,
  initialOpenApps: { agent: true, browser: false, notepad: false, calculator: false, clock: false, weather: false, appCenter: false, yachiyo: true, stream: false, settings: false },
  initialActiveApp: 'agent',
  overlays: [startOpen, controlOpen]
});
const desktopRef = ref(null);
const {
  addDesktopIcon,
  desktopIconApps,
  desktopIconKeys,
  moveDesktopIcon,
  removeDesktopIcon
} = useDesktopIcons({
  apps,
  defaultDesktopIconState: DEFAULT_DESKTOP_ICON_STATE,
  storageKey: DESKTOP_ICONS_STORAGE_KEY
});
const yachiyoPanelRef = ref(null);
const streamRef = ref(null);
const now = ref(Date.now());
const client = ref(null);
const live2d = useLive2D();
const {
  live2dDragging,
  reloadLive2DFrame,
  resetLive2DModel,
  startLive2DModelDrag,
  zoomLive2DModel
} = useLive2DWindow({
  defaultModel: DEFAULT_LIVE2D_MODEL,
  getStageElement: () => yachiyoPanelRef.value?.getStageElement?.(),
  live2d,
  openApps,
  storageKey: LIVE2D_MODEL_STORAGE_KEY
});
const lastLive2DIntent = ref(normalizeLive2DIntent({
  emotion: 'neutral',
  actions: ['look_at_chat', 'breathe'],
  reply: 'Hermes Agent OS ready.'
}));
const {
  activeConversationId,
  addMessage,
  addProcessEvent,
  clearConversationEvents,
  createConversation,
  displayedMessages,
  displayedProcessEvents,
  ensureActiveConversation,
  getActiveConversation,
  hasConversationContent,
  loadConversation: loadWorkspaceConversation,
  messageCount,
  messages,
  normalizedSidebarSearchQuery,
  processEvents,
  rememberWorkspace,
  selectProject: selectWorkspaceProject,
  visibleSidebarConversations,
  visibleSidebarProjects,
  workspaceName
} = useAgentWorkspace({ settings, sidebarSearchOpen, sidebarSearchQuery });

const toolEvents = ref([
  { id: 'design', name: 'FluentOS reference', status: 'done', detail: '任务栏、开始菜单、控制中心、窗口系统' },
  { id: 'bridge', name: 'Live2D Bridge', status: 'ready', detail: 'tsukuyomi:room-act' },
  { id: 'ws', name: 'Hermes Socket', status: 'idle', detail: '等待连接' }
]);

const {
  addContextReference,
  attachedItems,
  buildPromptInput,
  clearAttachedItems,
  composerDragging,
  onAgentFileChange,
  onAgentPaste,
  onComposerDragLeave,
  onComposerDragOver,
  onComposerDrop,
  removeAttachedItem
} = useAgentComposer({ prompt });
const modelMenuOpen = ref(false);
const detailExpanded = ref(false);
const streamBuffer = ref('');
const selectedModel = ref('deepseek-v4-pro');
const thinkingEnabled = ref(true);

const isConnected = computed(() => socketState.value === 'open');
const connectionLabel = computed(() => ({
  idle: '未连接',
  connecting: '连接中',
  open: '已连接',
  closing: '断开中',
  closed: '已断开',
  error: '异常'
}[socketState.value] || socketState.value));
const doneToolCount = computed(() => toolEvents.value.filter((item) => ['done', 'ready'].includes(item.status)).length);
const runningToolCount = computed(() => toolEvents.value.filter((item) => ['running', 'connecting'].includes(item.status)).length);
const activeModel = computed(() => agentModels.find((item) => item.id === selectedModel.value) || agentModels[0]);
const pendingAttachmentCount = computed(() => attachedItems.value.filter((item) => item.status === 'reading').length);
const usableAttachmentCount = computed(() => attachedItems.value.filter((item) => (
  item.kind === 'reference'
  || (item.kind === 'paste' && item.content)
  || (item.kind === 'file' && item.includeInPrompt && item.content)
)).length);
const composerHasContent = computed(() => Boolean(prompt.value.trim() || usableAttachmentCount.value) && !pendingAttachmentCount.value);

watch(() => settings.theme, (theme) => {
  document.documentElement.dataset.theme = theme;
}, { immediate: true });

watch(settings, () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}, { deep: true });

watch(messages, () => {
  nextTick(() => {
    if (streamRef.value) streamRef.value.scrollTop = streamRef.value.scrollHeight;
  });
}, { deep: true });

let clockTimer = 0;

function loadConversation(conversation) {
  loadWorkspaceConversation(conversation);
  focusApp('agent');
}

function selectProject(project) {
  selectWorkspaceProject(project);
  focusApp('agent');
}

function createProjectFromPrompt() {
  const path = normalizeWorkspacePath(window.prompt('输入项目路径', settings.workspace || '') || '');
  if (!path) return;
  selectProject({
    path,
    label: workspaceLabelFromPath(path),
    conversationCount: 0
  });
}

function startProjectConversation(project) {
  const path = normalizeWorkspacePath(project?.path || settings.workspace);
  if (!path) return;
  settings.workspace = path;
  rememberWorkspace(path);
  createConversation('新对话', path);
  clearStream();
  prompt.value = '';
  attachedItems.value = [];
  sidebarSearchOpen.value = false;
  sidebarSearchQuery.value = '';
  focusApp('agent');
}

function startNewConversation() {
  const current = getActiveConversation();
  if (!current || hasConversationContent()) createConversation('新对话');
  clearStream();
  prompt.value = '';
  attachedItems.value = [];
  sidebarSearchOpen.value = false;
  sidebarSearchQuery.value = '';
  focusApp('agent');
}

function toggleSidebarSearch() {
  sidebarSearchOpen.value = !sidebarSearchOpen.value;
  if (!sidebarSearchOpen.value) sidebarSearchQuery.value = '';
  focusApp('agent');
}

function updateToolEvent(id, patch) {
  const item = toolEvents.value.find((event) => event.id === id);
  if (item) {
    Object.assign(item, patch);
    return;
  }
  toolEvents.value.unshift({ id, name: patch.name || id, status: patch.status || 'running', detail: patch.detail || '' });
}

function onSocketState(event) {
  socketState.value = event.state;
  updateToolEvent('ws', {
    status: event.state === 'open' ? 'done' : event.state === 'error' ? 'error' : event.state,
    detail: event.detail?.url || event.detail?.reason || connectionLabel.value
  });
}

function onSocketMessage(packet) {
  const type = String(packet.type || 'message');
  const text = packetText(packet);
  const title = readablePacketTitle(type);

  if (/tool|command|exec|step/i.test(type)) {
    updateToolEvent(packet.id || `tool_${Date.now().toString(36)}`, {
      name: packet.data?.name || packet.data?.tool || type,
      status: packet.data?.status || 'running',
      detail: text || packet.data?.detail || packet.data?.path || ''
    });
  }

  const live2dIntent = extractLive2DIntent(packet.raw || packet.data || packet);
  if (live2dIntent && settings.autoLive2D) triggerLive2D(live2dIntent, 'Hermes');

  if (isStreamingPacket(type, packet)) {
    if (text) streamBuffer.value += text;
    return;
  }

  if (/error/i.test(type)) {
    currentRequestId.value = '';
    addMessage({
      type: 'error',
      title,
      text: text || stringifyPacket(packet),
      data: packet.raw,
      at: packet.receivedAt || Date.now()
    });
    return;
  }

  if (isFinalPacket(type, packet, text)) {
    currentRequestId.value = '';
    addMessage({
      type: 'assistant',
      title: 'Hermes 结果',
      text: finalResultText(packet, text || streamBuffer.value),
      data: packet.raw,
      at: packet.receivedAt || Date.now()
    });
    streamBuffer.value = '';
    updateToolEvent('run', { name: 'agent.run', status: 'done', detail: 'completed' });
    return;
  }

  addProcessEvent({
    type,
    title,
    text: text || stringifyPacket(packet),
    at: packet.receivedAt || Date.now()
  });
}

async function connectHermes() {
  if (!client.value) {
    client.value = new HermesSocketClient({
      url: settings.wsUrl,
      agent: settings.agent,
      onState: onSocketState,
      onMessage: onSocketMessage,
      onError: () => addMessage({ type: 'error', title: 'WebSocket 异常', text: '连接 Hermes 时出现错误。' })
    });
  }
  client.value.agent = settings.agent;
  try {
    await client.value.connect(settings.wsUrl);
  } catch (error) {
    addMessage({ type: 'error', title: 'Hermes connection failed', text: error?.message || 'Unable to connect Hermes.' });
  }
}

function disconnectHermes() {
  client.value?.close();
}

async function sendPrompt() {
  const input = prompt.value.trim();
  if (pendingAttachmentCount.value) {
    addMessage({ type: 'system', title: '文件读取中', text: '等待上传文件读取完成后再发送。' });
    return;
  }
  if (!input && !usableAttachmentCount.value) return;
  const runInput = buildPromptInput(input);
  const displayInput = input || 'Analyze attached context.';
  const attachmentSuffix = usableAttachmentCount.value ? `\n\n${usableAttachmentCount.value} context item(s) attached.` : '';
  ensureActiveConversation(displayInput);
  processEvents.value = [];
  streamBuffer.value = '';
  detailExpanded.value = false;
  addMessage({ type: 'user', title: `${settings.agent} / ${mode.value}`, text: `${displayInput}${attachmentSuffix}` });

  if (!isConnected.value) {
    addMessage({ type: 'system', title: '离线草稿', text: '连接 Hermes 后再次发送即可执行。' });
    triggerLive2D({ emotion: 'smile', actions: ['look_at_chat', 'nod'], reply: '任务已经记下来了。' }, 'local');
    return;
  }

  try {
    currentRequestId.value = await client.value.run({
      input: runInput,
      workspace: settings.workspace,
      mode: mode.value,
      metadata: {
        model: selectedModel.value,
        thinking: thinkingEnabled.value,
        attachments: attachedItems.value.filter((item) => item.status !== 'unsupported').map((item) => ({
          name: item.name,
          type: item.type,
          size: item.size,
          kind: item.kind
        })),
        live2d: {
          enabled: settings.autoLive2D,
          bridgeMode: settings.live2dBridgeMode
        }
      }
    });
    updateToolEvent('run', { name: 'agent.run', status: 'running', detail: currentRequestId.value });
    triggerLive2D({ emotion: 'happy', actions: ['smile', 'look_at_chat'], reply: 'Hermes 开始执行任务。' }, 'local');
    prompt.value = '';
    clearAttachedItems();
  } catch (error) {
    addMessage({ type: 'error', title: '发送失败', text: error?.message || '无法发送任务' });
  }
}

async function stopRun() {
  if (!currentRequestId.value || !isConnected.value) return;
  await client.value.stop(currentRequestId.value);
  addMessage({ type: 'system', title: '已请求停止', text: currentRequestId.value });
  currentRequestId.value = '';
}

function clearStream() {
  clearConversationEvents();
  streamBuffer.value = '';
  detailExpanded.value = false;
}

function triggerLive2D(source, origin = 'manual') {
  const intent = normalizeLive2DIntent(source);
  if (!intent) return;
  const dispatched = dispatchRoomLive2D(intent) || intent;
  lastLive2DIntent.value = dispatched;
  addMessage({
    type: 'live2d',
    title: `Live2D / ${origin}`,
    text: `${intent.emotion || intent.expression || 'neutral'} · ${intent.actions?.map((item) => item.type).join(', ') || intent.behaviorActions?.map((item) => item.type).join(', ') || 'idle'}`
  });
}

function triggerPreset(preset) {
  triggerLive2D({ ...preset, reply: `${preset.label} preset`, source: 'manual-preset' }, 'preset');
}

function sendLive2DToHermes() {
  if (!isConnected.value) {
    addMessage({ type: 'system', title: '尚未连接', text: '连接 Hermes 后可以把 Live2D intent 发给后端。' });
    return;
  }
  client.value.sendLive2D(lastLive2DIntent.value);
}

function onWindowMessage(event) {
  const data = event.data || {};
  if (data.source !== 'hermes-agent-os-live2d') return;
  addMessage({ type: 'live2d', title: 'Live2D Studio', text: data.message || data.type || 'Studio event' });
}

function toggleTheme() {
  settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
}

onMounted(() => {
  migrateLegacyHermesDesktopUrl();
  document.documentElement.dataset.theme = settings.theme;
  window.addEventListener('message', onWindowMessage);
  clockTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  window.removeEventListener('message', onWindowMessage);
  window.clearInterval(clockTimer);
  clearAttachedItems();
  client.value?.close();
});
</script>

<template>
  <div class="fluent-shell" :class="{ 'blur-off': !settings.fluentBlur, 'motion-off': !settings.motion }">
    <main ref="desktopRef" class="desktop" @click.self="startOpen = false; controlOpen = false">
      <DesktopIconLayer
        :icons="desktopIconApps"
        @focus-app="focusApp"
        @move-icon="moveDesktopIcon"
      />

      <TransitionGroup name="window-pop">
        <DesktopWindow
          v-if="openApps.agent"
          key="agent"
          app-key="agent"
          window-class="agent-window"
          :active="activeApp === 'agent'"
          :style-value="windowStyle('agent')"
          :resize-directions="resizeDirections"
          @focus="focusApp('agent')"
          @drag="startWindowDrag($event, 'agent')"
          @resize="(event, direction) => startWindowResize(event, 'agent', direction)"
        >
          <template #title><SystemIcon name="agent" :size="24" /> Hermes</template>
          <template #actions>
            <button type="button" title="还原默认大小和位置" @click.stop="resetWindow('agent')"><RotateCcw :size="14" /></button>
            <button type="button" title="最小化" @click.stop="closeApp('agent')"><Minus :size="15" /></button>
            <button type="button" title="最大化" @click.stop="maximizeWindow('agent')"><Maximize2 :size="14" /></button>
            <button type="button" title="关闭" @click.stop="closeApp('agent')"><X :size="15" /></button>
          </template>

          <HermesAgentPanel
            v-model:prompt="prompt"
            v-model:mode="mode"
            v-model:sidebar-search-open="sidebarSearchOpen"
            v-model:sidebar-search-query="sidebarSearchQuery"
            v-model:thinking-enabled="thinkingEnabled"
            v-model:selected-model="selectedModel"
            v-model:model-menu-open="modelMenuOpen"
            v-model:detail-expanded="detailExpanded"
            :settings="settings"
            :socket-state="socketState"
            :connection-label="connectionLabel"
            :workspace-name="workspaceName"
            :is-connected="isConnected"
            :projects="visibleSidebarProjects"
            :conversations="visibleSidebarConversations"
            :active-conversation-id="activeConversationId"
            :normalized-sidebar-search-query="normalizedSidebarSearchQuery"
            :displayed-messages="displayedMessages"
            :process-events="processEvents"
            :displayed-process-events="displayedProcessEvents"
            :attached-items="attachedItems"
            :composer-dragging="composerDragging"
            :agent-modes="agentModes"
            :agent-models="agentModels"
            :active-model="activeModel"
            :current-request-id="currentRequestId"
            :composer-has-content="composerHasContent"
            @start-new-conversation="startNewConversation"
            @toggle-sidebar-search="toggleSidebarSearch"
            @focus-stream="focusApp('stream')"
            @focus-settings="focusApp('settings')"
            @create-project="createProjectFromPrompt"
            @select-project="selectProject"
            @start-project-conversation="startProjectConversation"
            @load-conversation="loadConversation"
            @connect="connectHermes"
            @disconnect="disconnectHermes"
            @agent-file-change="onAgentFileChange"
            @add-context-reference="addContextReference"
            @composer-dragover="onComposerDragOver"
            @composer-dragleave="onComposerDragLeave"
            @composer-drop="onComposerDrop"
            @paste="onAgentPaste"
            @remove-attached-item="removeAttachedItem"
            @send-prompt="sendPrompt"
            @stop-run="stopRun"
          />
        </DesktopWindow>

        <DesktopWindow
          v-if="openApps.browser"
          key="browser"
          app-key="browser"
          window-class="browser-window"
          :active="activeApp === 'browser'"
          :style-value="windowStyle('browser')"
          :resize-directions="resizeDirections"
          @focus="focusApp('browser')"
          @drag="startWindowDrag($event, 'browser')"
          @resize="(event, direction) => startWindowResize(event, 'browser', direction)"
        >
          <template #title><SystemIcon name="browser" :size="24" /> 浏览器</template>
          <template #actions>
            <button type="button" title="还原默认大小和位置" @click.stop="resetWindow('browser')"><RotateCcw :size="14" /></button>
            <button type="button" title="最大化" @click.stop="maximizeWindow('browser')"><Maximize2 :size="14" /></button>
            <button type="button" title="最小化" @click.stop="closeApp('browser')"><Minus :size="15" /></button>
            <button type="button" title="关闭" @click.stop="closeApp('browser')"><X :size="15" /></button>
          </template>

          <BrowserPanel />
        </DesktopWindow>

        <DesktopWindow
          v-if="openApps.notepad"
          key="notepad"
          app-key="notepad"
          window-class="notepad-window"
          :active="activeApp === 'notepad'"
          :style-value="windowStyle('notepad')"
          :resize-directions="resizeDirections"
          @focus="focusApp('notepad')"
          @drag="startWindowDrag($event, 'notepad')"
          @resize="(event, direction) => startWindowResize(event, 'notepad', direction)"
        >
          <template #title><SystemIcon name="notepad" :size="24" /> 记事本</template>
          <template #actions>
            <button type="button" title="还原默认大小和位置" @click.stop="resetWindow('notepad')"><RotateCcw :size="14" /></button>
            <button type="button" title="最大化" @click.stop="maximizeWindow('notepad')"><Maximize2 :size="14" /></button>
            <button type="button" title="最小化" @click.stop="closeApp('notepad')"><Minus :size="15" /></button>
            <button type="button" title="关闭" @click.stop="closeApp('notepad')"><X :size="15" /></button>
          </template>

          <NotepadPanel />
        </DesktopWindow>

        <DesktopWindow
          v-if="openApps.calculator"
          key="calculator"
          app-key="calculator"
          window-class="calculator-window"
          :active="activeApp === 'calculator'"
          :style-value="windowStyle('calculator')"
          :resize-directions="resizeDirections"
          @focus="focusApp('calculator')"
          @drag="startWindowDrag($event, 'calculator')"
          @resize="(event, direction) => startWindowResize(event, 'calculator', direction)"
        >
          <template #title><SystemIcon name="calculator" :size="24" /> 计算器</template>
          <template #actions>
            <button type="button" title="还原默认大小和位置" @click.stop="resetWindow('calculator')"><RotateCcw :size="14" /></button>
            <button type="button" title="最大化" @click.stop="maximizeWindow('calculator')"><Maximize2 :size="14" /></button>
            <button type="button" title="最小化" @click.stop="closeApp('calculator')"><Minus :size="15" /></button>
            <button type="button" title="关闭" @click.stop="closeApp('calculator')"><X :size="15" /></button>
          </template>

          <CalculatorPanel />
        </DesktopWindow>

        <DesktopWindow
          v-if="openApps.clock"
          key="clock"
          app-key="clock"
          window-class="clock-window"
          :active="activeApp === 'clock'"
          :style-value="windowStyle('clock')"
          :resize-directions="resizeDirections"
          @focus="focusApp('clock')"
          @drag="startWindowDrag($event, 'clock')"
          @resize="(event, direction) => startWindowResize(event, 'clock', direction)"
        >
          <template #title><SystemIcon name="clock" :size="24" /> 时钟</template>
          <template #actions>
            <button type="button" title="还原默认大小和位置" @click.stop="resetWindow('clock')"><RotateCcw :size="14" /></button>
            <button type="button" title="最大化" @click.stop="maximizeWindow('clock')"><Maximize2 :size="14" /></button>
            <button type="button" title="最小化" @click.stop="closeApp('clock')"><Minus :size="15" /></button>
            <button type="button" title="关闭" @click.stop="closeApp('clock')"><X :size="15" /></button>
          </template>

          <ClockPanel />
        </DesktopWindow>

        <DesktopWindow
          v-if="openApps.weather"
          key="weather"
          app-key="weather"
          window-class="weather-window"
          :active="activeApp === 'weather'"
          :style-value="windowStyle('weather')"
          :resize-directions="resizeDirections"
          @focus="focusApp('weather')"
          @drag="startWindowDrag($event, 'weather')"
          @resize="(event, direction) => startWindowResize(event, 'weather', direction)"
        >
          <template #title><SystemIcon name="weather" :size="24" /> 天气</template>
          <template #actions>
            <button type="button" title="还原默认大小和位置" @click.stop="resetWindow('weather')"><RotateCcw :size="14" /></button>
            <button type="button" title="最大化" @click.stop="maximizeWindow('weather')"><Maximize2 :size="14" /></button>
            <button type="button" title="最小化" @click.stop="closeApp('weather')"><Minus :size="15" /></button>
            <button type="button" title="关闭" @click.stop="closeApp('weather')"><X :size="15" /></button>
          </template>

          <WeatherPanel />
        </DesktopWindow>

        <DesktopWindow
          v-if="openApps.appCenter"
          key="appCenter"
          app-key="appCenter"
          window-class="app-center-window"
          :active="activeApp === 'appCenter'"
          :style-value="windowStyle('appCenter')"
          :resize-directions="resizeDirections"
          @focus="focusApp('appCenter')"
          @drag="startWindowDrag($event, 'appCenter')"
          @resize="(event, direction) => startWindowResize(event, 'appCenter', direction)"
        >
          <template #title><SystemIcon name="appCenter" :size="24" /> 应用中心</template>
          <template #actions>
            <button type="button" title="还原默认大小和位置" @click.stop="resetWindow('appCenter')"><RotateCcw :size="14" /></button>
            <button type="button" title="最大化" @click.stop="maximizeWindow('appCenter')"><Maximize2 :size="14" /></button>
            <button type="button" title="最小化" @click.stop="closeApp('appCenter')"><Minus :size="15" /></button>
            <button type="button" title="关闭" @click.stop="closeApp('appCenter')"><X :size="15" /></button>
          </template>

          <AppCenterPanel
            :apps="apps"
            :open-apps="openApps"
            :active-app="activeApp"
            :desktop-icon-keys="desktopIconKeys"
            @focus-app="focusApp"
            @close-app="closeApp"
            @add-desktop-icon="addDesktopIcon"
            @remove-desktop-icon="removeDesktopIcon"
          />
        </DesktopWindow>

        <DesktopWindow
          v-if="openApps.yachiyo"
          key="yachiyo"
          app-key="yachiyo"
          window-class="yachiyo-window"
          :active="activeApp === 'yachiyo'"
          :style-value="windowStyle('yachiyo')"
          :resize-directions="resizeDirections"
          @focus="focusApp('yachiyo')"
          @drag="startWindowDrag($event, 'yachiyo')"
          @resize="(event, direction) => startWindowResize(event, 'yachiyo', direction)"
        >
          <template #title><SystemIcon name="yachiyo" :size="24" /> Yachiyo</template>
          <template #actions>
            <button type="button" title="重新加载" @click.stop="reloadLive2DFrame"><RefreshCw :size="14" /></button>
            <button type="button" title="还原默认大小和位置" @click.stop="resetWindow('yachiyo')"><RotateCcw :size="14" /></button>
            <button type="button" title="最大化" @click.stop="maximizeWindow('yachiyo')"><Maximize2 :size="14" /></button>
            <button type="button" title="最小化" @click.stop="closeApp('yachiyo')"><Minus :size="15" /></button>
            <button type="button" title="关闭" @click.stop="closeApp('yachiyo')"><X :size="15" /></button>
          </template>

          <YachiyoPanel
            ref="yachiyoPanelRef"
            :live2d="live2d"
            :live2d-dragging="live2dDragging"
            :last-live2-d-intent="lastLive2DIntent"
            :presets="live2dPresets"
            @model-drag-start="(event) => { focusApp('yachiyo'); startLive2DModelDrag(event); }"
            @model-wheel="zoomLive2DModel"
            @model-dblclick="resetLive2DModel"
            @preset="triggerPreset"
            @send-intent="sendLive2DToHermes"
          />
        </DesktopWindow>

        <DesktopWindow
          v-if="openApps.stream"
          key="stream"
          app-key="stream"
          window-class="stream-window"
          :active="activeApp === 'stream'"
          :style-value="windowStyle('stream')"
          :resize-directions="resizeDirections"
          @focus="focusApp('stream')"
          @drag="startWindowDrag($event, 'stream')"
          @resize="(event, direction) => startWindowResize(event, 'stream', direction)"
        >
          <template #title><SystemIcon name="stream" :size="24" /> Stream</template>
          <template #actions>
            <button type="button" title="还原默认大小和位置" @click.stop="resetWindow('stream')"><RotateCcw :size="14" /></button>
            <button type="button" title="最大化" @click.stop="maximizeWindow('stream')"><Maximize2 :size="14" /></button>
            <button type="button" title="最小化" @click.stop="closeApp('stream')"><Minus :size="15" /></button>
            <button type="button" title="关闭" @click.stop="closeApp('stream')"><X :size="15" /></button>
          </template>

          <div ref="streamRef" class="stream-list">
            <StreamPanel :messages="messages" />
          </div>
        </DesktopWindow>

        <DesktopWindow
          v-if="openApps.settings"
          key="settings"
          app-key="settings"
          window-class="settings-window"
          :active="activeApp === 'settings'"
          :style-value="windowStyle('settings')"
          :resize-directions="resizeDirections"
          @focus="focusApp('settings')"
          @drag="startWindowDrag($event, 'settings')"
          @resize="(event, direction) => startWindowResize(event, 'settings', direction)"
        >
          <template #title><SystemIcon name="settings" :size="24" /> 设置</template>
          <template #actions>
            <button type="button" title="还原默认大小和位置" @click.stop="resetWindow('settings')"><RotateCcw :size="14" /></button>
            <button type="button" title="最大化" @click.stop="maximizeWindow('settings')"><Maximize2 :size="14" /></button>
            <button type="button" title="关闭" @click.stop="closeApp('settings')"><X :size="15" /></button>
          </template>

          <SettingsPanel :settings="settings" />
        </DesktopWindow>
      </TransitionGroup>

      <Transition name="popover">
        <StartMenu
          v-if="startOpen"
          v-model:search-query="searchQuery"
          :apps="apps"
          @focus-app="focusApp"
          @inspect-project="prompt = '检查当前项目结构。'; focusApp('agent')"
          @open-stream="focusApp('stream')"
        />
      </Transition>

      <Transition name="popover">
        <ControlCenter
          v-if="controlOpen"
          :settings="settings"
          :message-count="messageCount"
          :done-tool-count="doneToolCount"
          :tool-count="toolEvents.length"
          @toggle-theme="toggleTheme"
        />
      </Transition>
    </main>

    <Taskbar
      :apps="apps"
      :active-app="activeApp"
      :open-apps="openApps"
      :socket-state="socketState"
      :connection-label="connectionLabel"
      :is-connected="isConnected"
      :start-open="startOpen"
      :now="now"
      @toggle-start="startOpen = !startOpen; controlOpen = false"
      @focus-app="focusApp"
      @toggle-connection="isConnected ? disconnectHermes() : connectHermes()"
      @toggle-control="controlOpen = !controlOpen; startOpen = false"
    />
  </div>
</template>

