import { agentOsPublicUrl, agentOsRuntimeWebSocketUrl } from './runtimeUrls';

export const STORAGE_KEY = 'hermesAgentOsSettings:v2';
export const WINDOWS_STORAGE_KEY = 'hermesAgentOsWindows:v11';
export const DESKTOP_ICONS_STORAGE_KEY = 'hermesAgentOsDesktopIcons:v1';
export const LIVE2D_MODEL_STORAGE_KEY = 'hermesAgentOsLive2DModel:v12';
export const PROJECTS_STORAGE_KEY = 'hermesAgentOsProjects:v1';
export const CONVERSATIONS_STORAGE_KEY = 'hermesAgentOsConversations:v1';
export const ACTIVE_CONVERSATION_STORAGE_KEY = 'hermesAgentOsActiveConversation:v1';
export const MAX_CONVERSATIONS = 50;

export const LEGACY_HERMES_DESKTOP_URLS = new Set([
  'http://127.0.0.1:56854',
  'http://127.0.0.1:65356',
  'wss://127.0.0.1/runtime/hermes',
  'wss://localhost/runtime/hermes'
]);

export const DEFAULT_HERMES_BRIDGE_URL = agentOsRuntimeWebSocketUrl('hermes');
export const DEFAULT_HERMES_DESKTOP_URL = 'desktop';

export const DEFAULT_WINDOW_STATE = {
  agent: { x: 160, y: 64, w: 860, h: 600, minW: 720, minH: 520 },
  browser: { x: 220, y: 92, w: 760, h: 540, minW: 540, minH: 390 },
  notepad: { x: 270, y: 118, w: 700, h: 520, minW: 520, minH: 380 },
  calculator: { x: 390, y: 122, w: 560, h: 530, minW: 430, minH: 460 },
  clock: { x: 430, y: 132, w: 590, h: 530, minW: 430, minH: 440 },
  weather: { x: 280, y: 104, w: 720, h: 560, minW: 540, minH: 480 },
  music: { x: 110, y: 54, w: 1040, h: 660, minW: 680, minH: 500 },
  appCenter: { x: 230, y: 104, w: 660, h: 500, minW: 480, minH: 380 },
  yachiyo: { x: 850, y: 84, w: 400, h: 560, minW: 330, minH: 420 },
  stream: { x: 320, y: 430, w: 560, h: 360, minW: 380, minH: 260 },
  settings: { x: 640, y: 64, w: 600, h: 540, minW: 500, minH: 420 }
};

export const DEFAULT_DESKTOP_ICON_STATE = [
  { key: 'settings', x: 24, y: 24 }
];

export const DEFAULT_LIVE2D_MODEL = {
  scale: 0.62,
  x: 0,
  y: 0
};

export const defaultSettings = {
  wsUrl: DEFAULT_HERMES_DESKTOP_URL,
  workspace: '',
  agent: 'hermes',
  llmProvider: 'openai-compatible',
  llmApiUrl: 'https://api.openai.com/v1/chat/completions',
  llmApiKey: '',
  llmModel: 'gpt-4o-mini',
  petSystemPrompt: '你是 Agent OS 的常驻桌宠。直接调用 Agent OS 内部 app 接口完成任务，不通过 Hermes。',
  live2dStudioUrl: agentOsPublicUrl(),
  live2dBridgeMode: 'event',
  autoLive2D: true,
  petMode: false,
  theme: 'light',
  fluentBlur: true,
  motion: true
};

export const agentModes = [
  { key: 'operate', label: '执行' },
  { key: 'plan', label: '规划' },
  { key: 'review', label: '审阅' }
];

export const quickPrompts = [
  '检查当前项目结构。',
  '执行下一步并汇报状态。',
  '总结最近事件流。',
  '让 Live2D 汇报任务进度。'
];

export const live2dPresets = [
  { key: 'focus', label: '专注', emotion: 'neutral', actions: ['look_at_chat', 'breathe'], intensity: 0.52 },
  { key: 'cheer', label: '鼓励', emotion: 'happy', actions: ['smile', 'bounce', 'ear_wiggle'], intensity: 0.74 },
  { key: 'report', label: '汇报', emotion: 'smile', actions: ['look_at_chat', 'nod', 'sway'], intensity: 0.64 },
  { key: 'alert', label: '提醒', emotion: 'surprised', actions: ['surprised', 'lean_in', 'emphasis'], intensity: 0.82 }
];

export const agentModels = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', detail: 'System API settings' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', detail: 'OpenAI-compatible provider' },
  { id: 'auto', name: 'Model Auto', detail: 'Use the configured provider default' },
  { id: 'fast', name: 'Fast Draft', detail: 'Short tasks and quick checks' }
];

export const agentQuickActions = [
  { key: 'inspect', label: 'Inspect project', prompt: '检查当前项目结构，并给出下一步建议。' },
  { key: 'continue', label: 'Continue work', prompt: '继续执行当前任务，并简洁汇报进度。' },
  { key: 'summarize', label: 'Summarize stream', prompt: '总结最近事件流，指出当前状态和阻塞点。' },
  { key: 'live2d', label: 'Live2D report', prompt: '让 Live2D 用自然语言汇报当前任务进度。' }
];
