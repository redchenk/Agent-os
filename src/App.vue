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
import FirstRunOnboarding from './components/FirstRunOnboarding.vue';
import HermesAgentPanel from './components/HermesAgentPanel.vue';
import MusicPanel from './components/MusicPanel.vue';
import NotepadPanel from './components/NotepadPanel.vue';
import PetModeOverlay from './components/PetModeOverlay.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import StartMenu from './components/StartMenu.vue';
import StreamPanel from './components/StreamPanel.vue';
import SystemIcon from './components/SystemIcon.vue';
import Taskbar from './components/Taskbar.vue';
import WeatherPanel from './components/WeatherPanel.vue';
import YachiyoPanel from './components/YachiyoPanel.vue';
import { callPetModel } from './services/agentOsPetModel';
import {
  loadTsukuyomiSession,
  loginTsukuyomiAccount,
  readStoredTsukuyomiSession,
  requestTsukuyomiLoginCode,
  tsukuyomiSiteUrl
} from './services/tsukuyomiAuth';
import { HermesSocketClient } from './services/hermesSocket';
import { migrateAgentLlmProviderSettings } from './services/llmProviderProfiles';
import {
  activateUserStorageScope,
  hasLegacyLocalData,
  importLegacyLocalData
} from './services/userLocalStorage';
import { dispatchRoomLive2D } from './services/room/live2dControl';
import { createLive2DSpeechPlayer } from './services/room/live2dSpeech';
import {
  readRoomTTSSettings,
  writeRoomLLMSettings,
  writeRoomTTSSettings
} from './services/room/roomSettings';
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
  { key: 'music', label: '音乐', iconName: 'music' },
  { key: 'appCenter', label: '应用中心', iconName: 'appCenter' },
  { key: 'yachiyo', label: 'Yachiyo', iconName: 'yachiyo' },
  { key: 'stream', label: 'Stream', iconName: 'stream' },
  { key: 'settings', label: '设置', iconName: 'settings' }
];

const ONBOARDING_STORAGE_KEY = 'agentOsOnboarding:v1';

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

function readLaunchFlags() {
  if (typeof window === 'undefined') return { petMode: false, nativePetShell: false };
  const params = new URLSearchParams(window.location.search || '');
  const petValue = String(params.get('pet') || '').toLowerCase();
  const nativeValue = String(params.get('nativePet') || '').toLowerCase();
  return {
    petMode: ['1', 'true', 'yes', 'on'].includes(petValue),
    nativePetShell: ['1', 'true', 'yes', 'on'].includes(nativeValue)
  };
}

function isLegacyHermesDesktopUrl(url) {
  return LEGACY_HERMES_DESKTOP_URLS.has(String(url || '').trim().replace(/\/+$/, ''));
}

function migrateLegacyHermesDesktopUrl() {
  if (isLegacyHermesDesktopUrl(settings.wsUrl)) settings.wsUrl = DEFAULT_HERMES_DESKTOP_URL;
}

const launchFlags = readLaunchFlags();
const settings = reactive(readSettings());
Object.assign(settings, migrateAgentLlmProviderSettings(settings));
if (launchFlags.petMode) settings.petMode = true;
const nativePetShell = ref(launchFlags.nativePetShell);
const loginVisible = ref(!nativePetShell.value);
const loginExiting = ref(false);
const onboardingVisible = ref(false);
const legacyLocalDataAvailable = ref(false);
const storageScopeReloading = ref(false);
const live2dAllowed = computed(() => (
  nativePetShell.value
  || (!loginVisible.value && !onboardingVisible.value && !storageScopeReloading.value)
));
migrateLegacyHermesDesktopUrl();
const mode = ref('operate');
const socketState = ref('idle');
const currentRequestId = ref('');
const prompt = ref('帮我检查这个前端 Agent OS 的设计，并给出下一步执行计划。');
const petBusy = ref(false);
const petReply = ref('我现在会直连模型 API，并通过 Agent OS app 接口执行动作。');
const petError = ref('');
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
  initialOpenApps: { agent: false, browser: false, notepad: false, calculator: false, clock: false, weather: false, music: false, appCenter: false, yachiyo: nativePetShell.value, stream: false, settings: false },
  initialActiveApp: nativePetShell.value ? 'yachiyo' : '',
  overlays: [startOpen, controlOpen]
});

function closeAllWorkspaceApps() {
  apps.forEach((app) => {
    openApps[app.key] = false;
  });
  activeApp.value = '';
  startOpen.value = false;
  controlOpen.value = false;
}

function openDefaultWorkspace(petMode = settings.petMode) {
  closeAllWorkspaceApps();
  openApps.yachiyo = true;
  if (petMode) {
    activeApp.value = 'yachiyo';
    return;
  }
  openApps.agent = true;
  activeApp.value = 'agent';
}
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
const browserPanelRef = ref(null);
const notepadPanelRef = ref(null);
const calculatorPanelRef = ref(null);
const clockPanelRef = ref(null);
const weatherPanelRef = ref(null);
const musicPanelRef = ref(null);
const streamRef = ref(null);
const now = ref(Date.now());
const client = ref(null);
const live2d = useLive2D();
const ttsSettings = reactive(writeRoomTTSSettings({
  ...readRoomTTSSettings(),
  provider: 'gpt-sovits',
  useProxy: false
}));
const ttsState = reactive({ status: ttsSettings.enabled ? 'idle' : 'disabled', error: '' });
const speechPlayer = createLive2DSpeechPlayer({
  onState: (patch = {}) => Object.assign(ttsState, patch)
});
const {
  live2dDragging,
  reloadLive2DFrame,
  resetLive2DModel,
  startLive2DModelDrag,
  zoomLive2DModel
} = useLive2DWindow({
  defaultModel: DEFAULT_LIVE2D_MODEL,
  enabled: live2dAllowed,
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
const selectedModel = ref(settings.llmModel || 'gpt-4o-mini');
const thinkingEnabled = ref(true);

const isConnected = computed(() => socketState.value === 'open');
const loginForm = reactive({
  method: 'password',
  username: '',
  password: '',
  emailCode: '',
  user: null,
  sessionVerified: false,
  message: '',
  messageType: 'info',
  checking: true,
  busy: false,
  sendingCode: false,
  codeCooldown: 0,
  showPassword: false
});
const loginTime = computed(() => new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit'
}).format(now.value));
const loginDate = computed(() => new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long'
}).format(now.value));
const loginUserInitial = computed(() => String(loginForm.user?.username || loginForm.username || 'T').trim().slice(0, 1).toUpperCase());
const loginPrimaryLabel = computed(() => {
  if (loginForm.checking) return '检查会话中...';
  if (loginForm.busy) return '验证中...';
  return '登录并进入';
});
const loginCodeLabel = computed(() => (loginForm.codeCooldown > 0 ? `${loginForm.codeCooldown}s` : '发送验证码'));
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

watch(() => [
  settings.llmProvider,
  settings.llmApiUrl,
  settings.llmApiKey,
  settings.llmModel,
  settings.petSystemPrompt
], () => {
  writeRoomLLMSettings({
    provider: settings.llmProvider,
    apiUrl: settings.llmApiUrl,
    apiKey: settings.llmApiKey,
    model: settings.llmModel,
    systemPrompt: settings.petSystemPrompt,
    useProxy: false
  });
}, { immediate: true });

watch(() => settings.llmModel, (model) => {
  if (model && !['auto', 'fast'].includes(selectedModel.value)) selectedModel.value = model;
});

watch(ttsSettings, () => {
  writeRoomTTSSettings(ttsSettings);
}, { deep: true });

watch(() => ttsSettings.enabled, (enabled) => {
  if (!enabled) {
    speechPlayer.stop();
    Object.assign(ttsState, { status: 'disabled', error: '' });
    return;
  }
  Object.assign(ttsState, { status: 'idle', error: '' });
  speechPlayer.warmup();
});

watch(messages, () => {
  nextTick(() => {
    if (streamRef.value) streamRef.value.scrollTop = streamRef.value.scrollHeight;
  });
}, { deep: true });

let clockTimer = 0;
let loginCodeTimer = 0;

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
  applyUiPatch(packet.data?.ui || packet.raw?.ui || packet.raw?.data?.ui);
  if (Array.isArray(packet.data?.results)) {
    packet.data.results.forEach((item) => applyUiPatch(item?.result?.data?.ui || item?.result?.ui));
  }

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
      onError: (error) => addMessage({
        type: 'error',
        title: 'Hermes 连接异常',
        text: error?.message || (settings.wsUrl === 'desktop'
          ? '无法连接本机 connector。请先运行 Agent OS local connector。'
          : '连接 Hermes 时出现错误。')
      }),
      onClose: (event) => {
        if (event?.code === 1000) return;
        addMessage({
          type: 'error',
          title: 'Hermes 已断开',
          text: event?.reason || (settings.wsUrl === 'desktop'
            ? '未找到本机 Hermes Desktop。请确认 Hermes Desktop 与 Agent OS local connector 都在运行。'
            : 'Hermes 连接已中断。')
        });
      }
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

function systemLlmSettings() {
  return {
    provider: settings.llmProvider,
    apiUrl: settings.llmApiUrl,
    apiKey: settings.llmApiKey,
    model: settings.llmModel,
    systemPrompt: settings.petSystemPrompt,
    source: 'agent-os-settings'
  };
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
    const runPromise = client.value.run({
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
        },
        llm: systemLlmSettings()
      }
    });
    if (client.value.protocol !== 'gateway' && client.value.lastRequestId) {
      currentRequestId.value = client.value.lastRequestId;
      updateToolEvent('run', { name: 'agent.run', status: 'running', detail: currentRequestId.value });
    }
    const resolvedRequestId = await runPromise;
    if (client.value.protocol === 'gateway' || currentRequestId.value) {
      currentRequestId.value = resolvedRequestId;
      updateToolEvent('run', { name: 'agent.run', status: 'running', detail: currentRequestId.value });
    }
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

function speakLive2DReply(reply, intent = {}) {
  const text = String(reply || '').trim();
  if (!text || !ttsSettings.enabled) return;
  speechPlayer.play(text, {
    emotion: intent.emotion || intent.expression || 'neutral',
    speechStyle: intent.speechStyle || intent.speech_style || null
  }).catch(() => {
    // Playback state is surfaced in Settings without interrupting the model result.
  });
}

async function testLocalTts() {
  if (!ttsSettings.enabled) return;
  speechPlayer.stop();
  Object.assign(ttsState, { status: 'loading', error: '' });
  try {
    await speechPlayer.warmup({ force: true });
    await speechPlayer.play('你好，我是月见夜千代。', {
      emotion: 'happy',
      speechStyle: { speed: 1.04, pitch: 0.04, pause: 'bright' }
    });
  } catch (_) {
    // The speech player publishes a readable error through ttsState.
  }
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

function applyUiPatch(patch) {
  if (!patch || typeof patch !== 'object') return;
  if (Object.prototype.hasOwnProperty.call(patch, 'petMode')) {
    settings.petMode = Boolean(patch.petMode);
  }
  const actions = [];
  if (patch.focusApp || patch.openApp) actions.push({ name: 'ui.focusApp', args: { app: patch.focusApp || patch.openApp } });
  if (patch.openStart) actions.push({ name: 'ui.openStart', args: {} });
  if (patch.openControlCenter) actions.push({ name: 'ui.openControlCenter', args: {} });
  actions.forEach((action) => {
    runLocalAgentOsAction(action).catch((error) => {
      addProcessEvent({
        type: 'agentos.ui',
        title: 'UI patch skipped',
        text: error?.message || 'Unable to apply UI patch.',
        at: Date.now()
      });
    });
  });
  if (patch.theme === 'dark' || patch.theme === 'light') settings.theme = patch.theme;
}

function setPetMode(enabled) {
  settings.petMode = Boolean(enabled);
}

function togglePetMode() {
  setPetMode(!settings.petMode);
}

function setLoginMessage(type, message) {
  loginForm.messageType = type || 'info';
  loginForm.message = message || '';
}

function applyTsukuyomiSession(session, { verified = true } = {}) {
  const user = session?.user || null;
  if (user) loginForm.username = user.username || user.email || loginForm.username;
  loginForm.user = verified ? user : null;
  loginForm.sessionVerified = Boolean(user && verified);
  if (user && verified) {
    const scopeChanged = activateUserStorageScope(user);
    if (scopeChanged && typeof window !== 'undefined') {
      storageScopeReloading.value = true;
      window.location.reload();
      return user;
    }
    legacyLocalDataAvailable.value = hasLegacyLocalData();
    const needsOnboarding = localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'complete';
    onboardingVisible.value = needsOnboarding;
    if (needsOnboarding) closeAllWorkspaceApps();
    else openDefaultWorkspace(settings.petMode);
  }
  return user;
}

function finishOnboarding(options = {}) {
  const theme = options.theme === 'dark' ? 'dark' : 'light';
  const petMode = Boolean(options.petMode);
  const importedCount = options.importLegacy ? importLegacyLocalData() : 0;
  const llmPatch = {
    llmProvider: options.llmProvider || settings.llmProvider,
    llmApiUrl: options.llmApiUrl || settings.llmApiUrl,
    llmApiKey: options.llmApiKey ?? settings.llmApiKey,
    llmModel: options.llmModel || settings.llmModel,
    llmProviderProfiles: options.llmProviderProfiles || settings.llmProviderProfiles
  };
  const savedTtsSettings = writeRoomTTSSettings(options.tts || ttsSettings);
  Object.assign(ttsSettings, savedTtsSettings);

  if (importedCount > 0) {
    let importedSettings = {};
    try {
      importedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch (_) {
      importedSettings = {};
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...importedSettings, ...llmPatch, theme, petMode }));
  } else {
    Object.assign(settings, llmPatch, { theme, petMode });
  }

  localStorage.setItem(ONBOARDING_STORAGE_KEY, 'complete');
  onboardingVisible.value = false;
  if (importedCount > 0 && typeof window !== 'undefined') {
    window.location.reload();
    return;
  }
  speechPlayer.warmup({ force: true });
  openDefaultWorkspace(petMode);
}

function reopenOnboarding() {
  legacyLocalDataAvailable.value = hasLegacyLocalData();
  onboardingVisible.value = true;
}

async function hydrateTsukuyomiLogin({ allowCachedOnNetworkError = true } = {}) {
  if (!loginVisible.value) return null;
  const cached = readStoredTsukuyomiSession();
  if (cached?.user) {
    loginForm.username = cached.user.username || cached.user.email || loginForm.username;
    setLoginMessage('info', `正在确认 ${cached.user.username || 'Tsukuyomi'} 的登录会话...`);
  } else {
    setLoginMessage('info', '正在连接 Tsukuyomi Space 账号系统...');
  }

  loginForm.checking = true;
  try {
    const session = await loadTsukuyomiSession({ allowCachedOnNetworkError });
    const verified = Boolean(session?.user && session.verified !== false);
    const user = applyTsukuyomiSession(session, { verified });
    if (user && verified) {
      setLoginMessage('success', `已登录 Tsukuyomi Space：${user.username || user.email || '当前账号'}`);
      return session;
    }
    if (user && !verified) {
      setLoginMessage('warning', `检测到本机缓存账号 ${user.username || user.email || 'Tsukuyomi'}，但需要连接后端确认后才能进入。`);
      return null;
    }
    setLoginMessage('info', '请使用 Tsukuyomi Space 账号登录 Agent OS。');
    return null;
  } catch (error) {
    applyTsukuyomiSession(cached, { verified: false });
    setLoginMessage('error', `无法连接 Tsukuyomi Space 账号系统：${error?.message || '网络错误'}`);
    return cached;
  } finally {
    loginForm.checking = false;
  }
}

function unlockLogin() {
  if (loginExiting.value) return;
  loginExiting.value = true;
  const finish = () => {
    loginVisible.value = false;
    loginExiting.value = false;
    loginForm.password = '';
    loginForm.emailCode = '';
  };
  if (typeof window === 'undefined') {
    finish();
    return;
  }
  window.setTimeout(finish, settings.motion ? 620 : 0);
}

async function submitTsukuyomiLogin({ pet = false } = {}) {
  if (loginForm.checking || loginForm.busy) return;
  if (loginForm.user) {
    if (pet) setPetMode(true);
    unlockLogin();
    return;
  }

  const username = loginForm.username.trim();
  if (!username) {
    setLoginMessage('error', loginForm.method === 'code' ? '请输入邮箱。' : '请输入用户名或邮箱。');
    return;
  }
  if (loginForm.method === 'password' && !loginForm.password) {
    setLoginMessage('error', '请输入 Tsukuyomi Space 登录密码。');
    return;
  }
  if (loginForm.method === 'code' && !loginForm.emailCode.trim()) {
    setLoginMessage('error', '请输入邮箱验证码。');
    return;
  }

  loginForm.busy = true;
  setLoginMessage('info', '正在向 Tsukuyomi Space 验证账号...');
  try {
    const result = await loginTsukuyomiAccount({
      username,
      password: loginForm.password,
      emailCode: loginForm.emailCode,
      loginMethod: loginForm.method
    });
    applyTsukuyomiSession({ user: result.user }, { verified: true });
    setLoginMessage('success', `${result.user.username || '账号'} 登录成功，正在进入 Agent OS...`);
    if (pet) setPetMode(true);
    if (typeof window === 'undefined') unlockLogin();
    else window.setTimeout(unlockLogin, settings.motion ? 360 : 0);
  } catch (error) {
    setLoginMessage('error', error?.message || '登录失败，请检查账号和密码。');
  } finally {
    loginForm.busy = false;
  }
}

function startLoginCodeCooldown() {
  window.clearInterval(loginCodeTimer);
  loginForm.codeCooldown = 60;
  loginCodeTimer = window.setInterval(() => {
    loginForm.codeCooldown = Math.max(0, loginForm.codeCooldown - 1);
    if (loginForm.codeCooldown <= 0) window.clearInterval(loginCodeTimer);
  }, 1000);
}

async function sendTsukuyomiLoginCode() {
  if (loginForm.sendingCode || loginForm.codeCooldown > 0) return;
  const email = loginForm.username.trim();
  if (!email) {
    setLoginMessage('error', '请先输入邮箱，再发送验证码。');
    return;
  }
  loginForm.sendingCode = true;
  try {
    const message = await requestTsukuyomiLoginCode(email);
    setLoginMessage('success', message || '验证码已发送。');
    startLoginCodeCooldown();
  } catch (error) {
    setLoginMessage('error', error?.message || '验证码发送失败。');
  } finally {
    loginForm.sendingCode = false;
  }
}

function openTsukuyomiAuth(path) {
  if (typeof window === 'undefined') return;
  window.open(tsukuyomiSiteUrl(path), '_blank', 'noopener,noreferrer');
}

function isLocalAgentOsAction(action) {
  const name = String(action?.name || '').trim();
  return name.startsWith('ui.') || name.startsWith('agentos.ui.') || name.startsWith('app.');
}

function resolveAppKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const app = apps.find((item) => item.key.toLowerCase() === normalized || item.label.toLowerCase() === normalized);
  return app?.key || '';
}

function appLabel(appKey) {
  return apps.find((item) => item.key === appKey)?.label || appKey;
}

function appPanelRef(appKey) {
  return {
    browser: browserPanelRef,
    notepad: notepadPanelRef,
    calculator: calculatorPanelRef,
    clock: clockPanelRef,
    weather: weatherPanelRef,
    music: musicPanelRef
  }[appKey] || null;
}

async function ensureAppInterface(appKey) {
  focusApp(appKey);
  await nextTick();
  return appPanelRef(appKey)?.value || null;
}

function getAgentOsPetTools() {
  return [
    { name: 'ui.focusApp', args: { app: 'agent|browser|notepad|calculator|clock|weather|music|appCenter|stream|settings' }, description: '打开或聚焦 Agent OS 应用窗口' },
    { name: 'ui.closeApp', args: { app: 'app key' }, description: '关闭 Agent OS 应用窗口' },
    { name: 'ui.openStart', args: {}, description: '打开开始菜单' },
    { name: 'ui.openControlCenter', args: {}, description: '打开控制中心' },
    { name: 'ui.toggleTheme', args: {}, description: '切换浅色/深色主题' },
    { name: 'app.appCenter.list', args: {}, description: '列出 Agent OS 内置应用' },
    { name: 'app.appCenter.open', args: { app: 'app key' }, description: '从应用中心打开应用' },
    { name: 'app.notepad.createNote', args: { title: '标题', body: '内容', pinned: false }, description: '在记事本中新建笔记' },
    { name: 'app.notepad.appendActive', args: { text: '追加文本' }, description: '向当前笔记追加文本' },
    { name: 'app.notepad.search', args: { query: '关键词' }, description: '搜索笔记' },
    { name: 'app.notepad.readActive', args: {}, description: '读取当前笔记摘要' },
    { name: 'app.browser.open', args: { url: 'https://example.com' }, description: '在 Agent OS 浏览器中打开 URL' },
    { name: 'app.browser.search', args: { query: '搜索词' }, description: '使用 Agent OS 浏览器搜索' },
    { name: 'app.calculator.evaluate', args: { expression: '2*(3+4)' }, description: '调用计算器计算表达式' },
    { name: 'app.weather.current', args: {}, description: '读取当前天气' },
    { name: 'app.weather.searchCity', args: { query: '城市', selectFirst: true }, description: '搜索并切换天气城市' },
    { name: 'app.weather.refresh', args: {}, description: '刷新天气' },
    { name: 'app.clock.show', args: { tab: 'world|timer|stopwatch|alarm' }, description: '切换时钟功能页' },
    { name: 'app.clock.setTimer', args: { hours: 0, minutes: 5, seconds: 0, start: true }, description: '设置计时器' },
    { name: 'app.clock.addAlarm', args: { time: '08:30', label: '提醒' }, description: '添加闹钟' },
    { name: 'app.music.search', args: { query: '歌曲、歌手或专辑', provider: 'netease|qqmusic' }, description: '在音乐 App 中搜索音乐' },
    { name: 'app.music.play', args: { query: '歌曲或歌手', provider: 'netease|qqmusic' }, description: '搜索并立即播放第一条匹配音乐' },
    { name: 'app.music.pause', args: {}, description: '暂停当前音乐' },
    { name: 'app.music.resume', args: {}, description: '继续播放当前音乐' },
    { name: 'app.music.next', args: {}, description: '播放下一首音乐' },
    { name: 'app.music.previous', args: {}, description: '播放上一首音乐' },
    { name: 'app.music.nowPlaying', args: {}, description: '读取当前播放状态与播放队列' },
    { name: 'app.music.setVolume', args: { volume: 0.7 }, description: '设置音乐音量，范围 0 到 1' },
    { name: 'app.stream.summary', args: {}, description: '读取事件流摘要' },
    { name: 'app.settings.open', args: {}, description: '打开系统设置' }
  ];
}

function getAgentOsStateSnapshot() {
  return {
    activeApp: activeApp.value,
    openApps: Object.fromEntries(Object.entries(openApps).filter(([, value]) => value)),
    workspace: workspaceName.value,
    theme: settings.theme,
    model: {
      provider: settings.llmProvider,
      apiUrl: settings.llmApiUrl,
      model: settings.llmModel,
      configured: Boolean(settings.llmApiKey)
    },
    recentMessages: messages.value.slice(-5).map((message) => ({
      type: message.type,
      title: message.title,
      text: String(message.text || '').slice(0, 260)
    }))
  };
}

function compactActionResult(result) {
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result, null, 2).slice(0, 1200);
  } catch (_) {
    return String(result || '');
  }
}

async function runAppAction(name, args = {}) {
  switch (name) {
    case 'app.appCenter.list':
      focusApp('appCenter');
      return apps.map((app) => ({ key: app.key, label: app.label, open: Boolean(openApps[app.key]) }));
    case 'app.appCenter.open':
      return runLocalAgentOsAction({ name: 'ui.focusApp', args: { app: args.app || args.key } });
    case 'app.settings.open':
      return runLocalAgentOsAction({ name: 'ui.focusApp', args: { app: 'settings' } });
    case 'app.notepad.createNote': {
      const api = await ensureAppInterface('notepad');
      return api?.createNote?.({ title: args.title, body: args.body, pinned: args.pinned }) || '记事本接口未就绪';
    }
    case 'app.notepad.appendActive': {
      const api = await ensureAppInterface('notepad');
      return api?.appendActiveNote?.(args.text || '') || '记事本接口未就绪';
    }
    case 'app.notepad.search': {
      const api = await ensureAppInterface('notepad');
      return api?.searchNotes?.(args.query || '') || [];
    }
    case 'app.notepad.readActive': {
      const api = await ensureAppInterface('notepad');
      return api?.readActiveNote?.() || null;
    }
    case 'app.browser.open': {
      const api = await ensureAppInterface('browser');
      return api?.open?.(args.url || args.query || '') || '浏览器接口未就绪';
    }
    case 'app.browser.search': {
      const api = await ensureAppInterface('browser');
      return api?.search?.(args.query || '') || '浏览器接口未就绪';
    }
    case 'app.calculator.evaluate': {
      const api = await ensureAppInterface('calculator');
      return api?.evaluate?.(args.expression || args.input || '') || '计算器接口未就绪';
    }
    case 'app.weather.current': {
      const api = await ensureAppInterface('weather');
      return api?.current?.() || '天气接口未就绪';
    }
    case 'app.weather.searchCity': {
      const api = await ensureAppInterface('weather');
      return await api?.searchCity?.(args.query || args.city || '', { selectFirst: args.selectFirst !== false });
    }
    case 'app.weather.refresh': {
      const api = await ensureAppInterface('weather');
      return await api?.refresh?.();
    }
    case 'app.weather.setUnit': {
      const api = await ensureAppInterface('weather');
      return await api?.setUnit?.(args.unit);
    }
    case 'app.clock.show': {
      const api = await ensureAppInterface('clock');
      return api?.show?.(args.tab || 'world') || '时钟接口未就绪';
    }
    case 'app.clock.setTimer': {
      const api = await ensureAppInterface('clock');
      return api?.setTimer?.(args) || '时钟接口未就绪';
    }
    case 'app.clock.addAlarm': {
      const api = await ensureAppInterface('clock');
      return api?.addAlarm?.(args) || '时钟接口未就绪';
    }
    case 'app.clock.status': {
      const api = await ensureAppInterface('clock');
      return api?.state?.() || '时钟接口未就绪';
    }
    case 'app.music.search': {
      const api = await ensureAppInterface('music');
      return await api?.search?.(args.query || '', { provider: args.provider });
    }
    case 'app.music.play': {
      const api = await ensureAppInterface('music');
      return await api?.play?.(args.query || args.title || '', { provider: args.provider });
    }
    case 'app.music.pause': {
      const api = await ensureAppInterface('music');
      return await api?.pause?.();
    }
    case 'app.music.resume': {
      const api = await ensureAppInterface('music');
      return await api?.resume?.();
    }
    case 'app.music.next': {
      const api = await ensureAppInterface('music');
      return await api?.next?.();
    }
    case 'app.music.previous': {
      const api = await ensureAppInterface('music');
      return await api?.previous?.();
    }
    case 'app.music.nowPlaying': {
      const api = await ensureAppInterface('music');
      return api?.nowPlaying?.() || '音乐接口未就绪';
    }
    case 'app.music.setVolume': {
      const api = await ensureAppInterface('music');
      return api?.setVolume?.(args.volume ?? args.value) ?? '音乐接口未就绪';
    }
    case 'app.stream.summary':
      focusApp('stream');
      return messages.value.slice(-8).map((message) => `${message.title || message.type}: ${message.text}`).join('\n') || '暂无事件';
    default:
      throw new Error(`Unsupported Agent OS app action: ${name}`);
  }
}

async function runLocalAgentOsAction(action = {}) {
  const name = String(action.name || '').trim().replace(/^agentos\./, '');
  const args = action.args || {};
  if (name.startsWith('app.')) return runAppAction(name, args);
  switch (name) {
    case 'ui.focusApp':
    case 'ui.openApp': {
      const appKey = resolveAppKey(args.app || args.key || args.name);
      if (!appKey) throw new Error('ui.focusApp requires a valid Agent OS app key.');
      focusApp(appKey);
      return `已打开/聚焦 ${appLabel(appKey)}`;
    }
    case 'ui.closeApp': {
      const appKey = resolveAppKey(args.app || args.key || args.name);
      if (!appKey) throw new Error('ui.closeApp requires a valid Agent OS app key.');
      closeApp(appKey);
      return `已关闭 ${appLabel(appKey)}`;
    }
    case 'ui.openStart':
      startOpen.value = true;
      controlOpen.value = false;
      return '已打开开始菜单';
    case 'ui.openControlCenter':
      controlOpen.value = true;
      startOpen.value = false;
      return '已打开控制中心';
    case 'ui.toggleTheme':
      toggleTheme();
      return `已切换到 ${settings.theme === 'dark' ? '深色' : '浅色'}主题`;
    case 'ui.newConversation':
      startNewConversation();
      return '已创建/聚焦新对话';
    case 'ui.inspectProject':
      prompt.value = '检查当前项目结构。';
      focusApp('agent');
      return '已把项目检查任务放入助手窗口';
    case 'ui.petMode':
      setPetMode(args.enabled ?? args.on ?? true);
      return `已${settings.petMode ? '开启' : '关闭'}常驻桌宠`;
    default:
      throw new Error(`Unsupported Agent OS UI action: ${action.name}`);
  }
}

async function runPetActions(actions = [], label = '桌宠本地操控') {
  const results = [];
  for (const action of actions) {
    if (!isLocalAgentOsAction(action)) {
      results.push({ status: 'error', name: action?.name || '', summary: '桌宠只允许调用 Agent OS 内部 app 接口。' });
      continue;
    }
    try {
      const result = await runLocalAgentOsAction(action);
      results.push({ status: 'done', name: action.name, summary: compactActionResult(result) });
    } catch (error) {
      results.push({ status: 'error', name: action?.name || '', summary: error?.message || 'Agent OS app action failed.' });
    }
  }
  if (results.length) {
    addProcessEvent({
      type: 'agentos.ui',
      title: label,
      text: results.map((item) => `${item.status === 'done' ? 'OK' : 'ERR'} ${item.name}: ${item.summary}`).join('\n'),
      at: Date.now()
    });
  }
  return results;
}

async function sendPetPrompt() {
  const input = prompt.value.trim();
  if (!input || petBusy.value) return;
  petBusy.value = true;
  speechPlayer.stop();
  petError.value = '';
  petReply.value = '正在直连模型 API...';
  ensureActiveConversation(input);
  addMessage({ type: 'user', title: '桌宠 / Direct API', text: input });

  try {
    const result = await callPetModel({
      settings,
      input,
      tools: getAgentOsPetTools(),
      state: getAgentOsStateSnapshot()
    });
    const actionResults = await runPetActions(result.actions, '桌宠模型动作');
    const reply = result.reply || actionResults.map((item) => item.summary).join('\n') || '已完成。';
    petReply.value = reply;
    addMessage({
      type: 'assistant',
      title: '桌宠结果',
      text: `${reply}${actionResults.length ? `\n\n${actionResults.map((item) => `${item.name}: ${item.summary}`).join('\n')}` : ''}`,
      at: Date.now()
    });
    const speechIntent = result.live2d || { emotion: 'happy', actions: ['look_at_chat', 'nod'], reply };
    triggerLive2D(speechIntent, 'pet-api');
    speakLive2DReply(reply, speechIntent);
    prompt.value = '';
  } catch (error) {
    petError.value = error?.message || '桌宠模型调用失败。';
    petReply.value = petError.value;
    addMessage({ type: 'error', title: '桌宠模型调用失败', text: petError.value });
    focusApp('settings');
  } finally {
    petBusy.value = false;
  }
}

function toggleTheme() {
  settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
}

watch(() => settings.petMode, (enabled) => {
  startOpen.value = false;
  controlOpen.value = false;
  openApps.yachiyo = true;
  if (enabled) {
    if (activeApp.value === 'yachiyo') activeApp.value = 'agent';
    triggerLive2D({ emotion: 'happy', actions: ['smile', 'look_at_chat'], reply: '常驻桌宠已开启。' }, 'pet-mode');
  }
  nextTick(() => reloadLive2DFrame());
});

onMounted(() => {
  migrateLegacyHermesDesktopUrl();
  document.documentElement.dataset.theme = settings.theme;
  window.addEventListener('message', onWindowMessage);
  clockTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
  hydrateTsukuyomiLogin();
});

onBeforeUnmount(() => {
  window.removeEventListener('message', onWindowMessage);
  window.clearInterval(clockTimer);
  window.clearInterval(loginCodeTimer);
  clearAttachedItems();
  speechPlayer.destroy();
  client.value?.close();
});
</script>

<template>
  <div class="fluent-shell" :class="{ 'blur-off': !settings.fluentBlur, 'motion-off': !settings.motion, 'pet-mode': settings.petMode, 'native-pet-shell': nativePetShell }">
    <Transition name="login-gate">
      <section
        v-if="loginVisible"
        class="login-screen"
        :class="{ leaving: loginExiting }"
        aria-label="Agent OS 登录开屏"
        tabindex="-1"
      >
        <div class="login-clock">
          <strong>{{ loginTime }}</strong>
          <span>{{ loginDate }}</span>
        </div>

        <form class="login-card" @submit.prevent="submitTsukuyomiLogin()">
          <div class="login-avatar login-avatar-account">
            <span>{{ loginUserInitial }}</span>
          </div>
          <div class="login-identity">
            <strong>{{ loginForm.user?.username || 'Tsukuyomi Gate' }}</strong>
            <span>{{ loginForm.user ? '已连接 Tsukuyomi Space 账号' : '使用 Tsukuyomi Space 账号登录 Agent OS' }}</span>
          </div>
          <p v-if="loginForm.message" class="login-message" :class="loginForm.messageType">{{ loginForm.message }}</p>

          <template v-if="!loginForm.user">
            <div class="login-method-row" aria-label="登录方式">
              <button
                type="button"
                :class="{ active: loginForm.method === 'password' }"
                @click="loginForm.method = 'password'; setLoginMessage('info', '请输入 Tsukuyomi Space 账号密码。')"
              >
                密码登录
              </button>
              <button
                type="button"
                :class="{ active: loginForm.method === 'code' }"
                @click="loginForm.method = 'code'; setLoginMessage('info', '请输入邮箱并获取验证码。')"
              >
                验证码登录
              </button>
            </div>

            <label class="login-field">
              <span>{{ loginForm.method === 'code' ? '邮箱' : '账号 / 邮箱' }}</span>
              <input
                v-model="loginForm.username"
                type="text"
                autocomplete="username"
                :placeholder="loginForm.method === 'code' ? 'you@example.com' : '用户名或邮箱'"
                :disabled="loginForm.busy || loginForm.checking"
                autofocus
              />
            </label>

            <label v-if="loginForm.method === 'password'" class="login-field">
              <span>密码</span>
              <div class="login-input-action">
                <input
                  v-model="loginForm.password"
                  :type="loginForm.showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  placeholder="Tsukuyomi Space 密码"
                  :disabled="loginForm.busy || loginForm.checking"
                />
                <button type="button" @click="loginForm.showPassword = !loginForm.showPassword">
                  {{ loginForm.showPassword ? '隐藏' : '显示' }}
                </button>
              </div>
            </label>

            <label v-else class="login-field">
              <span>邮箱验证码</span>
              <div class="login-code-row">
                <input
                  v-model="loginForm.emailCode"
                  type="text"
                  inputmode="numeric"
                  maxlength="6"
                  placeholder="6 位验证码"
                  :disabled="loginForm.busy || loginForm.checking"
                />
                <button
                  type="button"
                  :disabled="loginForm.sendingCode || loginForm.codeCooldown > 0 || loginForm.busy || loginForm.checking"
                  @click="sendTsukuyomiLoginCode"
                >
                  {{ loginCodeLabel }}
                </button>
              </div>
            </label>
          </template>

          <div v-else class="login-user-pill">
            <span>{{ loginForm.user.email || 'Tsukuyomi Space' }}</span>
            <strong>{{ loginForm.user.role || 'user' }}</strong>
          </div>

          <div class="login-actions">
            <button class="login-unlock" type="submit" :disabled="loginForm.busy || loginForm.checking">{{ loginPrimaryLabel }}</button>
            <button class="login-secondary" type="button" :disabled="loginForm.busy || loginForm.checking" @click="openTsukuyomiAuth('/register')">注册</button>
          </div>

        </form>
      </section>
    </Transition>

    <Transition name="login-gate">
      <FirstRunOnboarding
        v-if="!loginVisible && onboardingVisible"
        :user="loginForm.user"
        :legacy-data-available="legacyLocalDataAvailable"
        :initial-theme="settings.theme"
        :initial-pet-mode="settings.petMode"
        :initial-llm-provider="settings.llmProvider"
        :initial-llm-api-url="settings.llmApiUrl"
        :initial-llm-api-key="settings.llmApiKey"
        :initial-llm-model="settings.llmModel"
        :initial-llm-provider-profiles="settings.llmProviderProfiles"
        :initial-tts-settings="ttsSettings"
        @finish="finishOnboarding"
      />
    </Transition>

    <main
      v-show="!onboardingVisible"
      ref="desktopRef"
      class="desktop"
      :inert="loginVisible || onboardingVisible || storageScopeReloading"
      :aria-hidden="loginVisible || onboardingVisible || storageScopeReloading ? 'true' : undefined"
      @click.self="startOpen = false; controlOpen = false"
    >
      <DesktopIconLayer
        :icons="desktopIconApps"
        @focus-app="focusApp"
        @move-icon="moveDesktopIcon"
      />

      <PetModeOverlay
        v-if="settings.petMode"
        ref="yachiyoPanelRef"
        v-model:prompt="prompt"
        :live2d="live2d"
        :live2d-dragging="live2dDragging"
        :pet-busy="petBusy"
        :pet-error="petError"
        :pet-reply="petReply"
        @model-drag-start="startLive2DModelDrag"
        @model-wheel="zoomLive2DModel"
        @model-dblclick="resetLive2DModel"
        @send-prompt="sendPetPrompt"
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

          <BrowserPanel ref="browserPanelRef" />
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

          <NotepadPanel ref="notepadPanelRef" />
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

          <CalculatorPanel ref="calculatorPanelRef" />
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

          <ClockPanel ref="clockPanelRef" />
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

          <WeatherPanel ref="weatherPanelRef" />
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
          v-if="openApps.music"
          key="music"
          app-key="music"
          window-class="music-window"
          :active="activeApp === 'music'"
          :style-value="windowStyle('music')"
          :resize-directions="resizeDirections"
          @focus="focusApp('music')"
          @drag="startWindowDrag($event, 'music')"
          @resize="(event, direction) => startWindowResize(event, 'music', direction)"
        >
          <template #title><SystemIcon name="music" :size="24" /> 音乐</template>
          <template #actions>
            <button type="button" title="还原默认大小和位置" @click.stop="resetWindow('music')"><RotateCcw :size="14" /></button>
            <button type="button" title="最大化" @click.stop="maximizeWindow('music')"><Maximize2 :size="14" /></button>
            <button type="button" title="最小化" @click.stop="closeApp('music')"><Minus :size="15" /></button>
            <button type="button" title="关闭" @click.stop="closeApp('music')"><X :size="15" /></button>
          </template>

          <MusicPanel ref="musicPanelRef" />
        </DesktopWindow>

        <DesktopWindow
          v-if="openApps.yachiyo && !settings.petMode"
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

          <SettingsPanel
            :settings="settings"
            :tts-settings="ttsSettings"
            :tts-state="ttsState"
            @open-onboarding="reopenOnboarding"
            @test-tts="testLocalTts"
          />
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
      v-show="!onboardingVisible"
      :inert="loginVisible || onboardingVisible || storageScopeReloading"
      :aria-hidden="loginVisible || onboardingVisible || storageScopeReloading ? 'true' : undefined"
      :apps="apps"
      :active-app="activeApp"
      :open-apps="openApps"
      :socket-state="socketState"
      :connection-label="connectionLabel"
      :is-connected="isConnected"
      :pet-mode="settings.petMode"
      :start-open="startOpen"
      :now="now"
      @toggle-start="startOpen = !startOpen; controlOpen = false"
      @focus-app="focusApp"
      @toggle-connection="isConnected ? disconnectHermes() : connectHermes()"
      @toggle-control="controlOpen = !controlOpen; startOpen = false"
      @toggle-pet-mode="togglePetMode"
    />
  </div>
</template>

