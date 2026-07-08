const ROOM_ACT_EVENT = 'tsukuyomi:room-act';
const AGENT_OS_EVENT = 'agent-os:live2d-control';

const emotionActions = {
  happy: ['smile', 'bounce', 'look_at_chat'],
  smile: ['smile', 'sway', 'look_at_chat'],
  smug: ['smirk', 'lean_in', 'head_tilt'],
  surprised: ['surprised', 'ear_perk', 'lean_in'],
  sad: ['breathe', 'nod', 'look_at_chat'],
  angry: ['lean_in', 'emphasis', 'shake_head'],
  shy: ['smile', 'blink', 'sway'],
  neutral: ['look_at_chat', 'breathe']
};

function textEmotion(text = '') {
  const value = String(text).toLowerCase();
  if (/(开心|高兴|微笑|笑|happy|great|nice|成功|完成)/iu.test(value)) return 'happy';
  if (/(惊|哇|wow|surpris|shock|失败|报错|错误)/iu.test(value)) return 'surprised';
  if (/(难过|伤心|sad|sorry|遗憾)/iu.test(value)) return 'sad';
  if (/(生气|愤怒|angry|blocked|危险|拒绝)/iu.test(value)) return 'angry';
  if (/(得意|坏笑|smug|teas|自信)/iu.test(value)) return 'smug';
  return 'neutral';
}

function normalizeAction(action, fallbackDuration = 1.2) {
  if (typeof action === 'string') {
    return { type: action, duration: fallbackDuration };
  }

  if (!action || typeof action !== 'object') return null;
  const type = String(action.type || action.action || action.name || '').trim();
  if (!type) return null;
  return {
    ...action,
    type,
    duration: Number.isFinite(Number(action.duration)) ? Number(action.duration) : fallbackDuration
  };
}

function pickLive2DSource(packet) {
  if (!packet || typeof packet !== 'object') return null;
  return packet.live2d || packet.control || packet.intent || packet.data?.live2d || packet.payload?.live2d || null;
}

export function normalizeLive2DIntent(source, fallbackText = '') {
  const raw = typeof source === 'string'
    ? { reply: source, emotion: textEmotion(source) }
    : (source && typeof source === 'object' ? source : {});

  const emotion = String(raw.emotion || raw.mood || raw.expression || textEmotion(fallbackText || raw.reply || raw.text || '') || 'neutral')
    .trim()
    .toLowerCase();
  const duration = Number(raw.duration || raw.durationMs || 1.4);
  const actions = (Array.isArray(raw.actions) && raw.actions.length ? raw.actions : emotionActions[emotion] || emotionActions.neutral)
    .map((action) => normalizeAction(action, duration))
    .filter(Boolean)
    .slice(0, 5);

  return {
    emotion,
    expression: raw.expression || emotion,
    intensity: Math.min(Math.max(Number(raw.intensity ?? 0.68), 0.2), 1),
    actions,
    behaviorActions: actions,
    speechStyle: raw.speechStyle || raw.speech_style || null,
    interruptPolicy: raw.interruptPolicy || raw.interrupt || { mode: 'blend', priority: 4 },
    source: raw.source || 'agent-os',
    reply: raw.reply || raw.text || fallbackText || '',
    durationMs: Number.isFinite(duration) ? Math.round(duration * (duration < 60 ? 1000 : 1)) : 1400
  };
}

export function extractLive2DIntent(packet) {
  const source = pickLive2DSource(packet);
  if (!source) return null;
  const fallbackText = packet?.text || packet?.message || packet?.data?.text || packet?.data?.message || '';
  return normalizeLive2DIntent(source, fallbackText);
}

export function dispatchLive2DIntent(intent, options = {}) {
  if (typeof window === 'undefined' || !intent) return null;

  const normalized = normalizeLive2DIntent(intent);
  window.dispatchEvent(new CustomEvent(ROOM_ACT_EVENT, { detail: normalized }));
  window.dispatchEvent(new CustomEvent(AGENT_OS_EVENT, { detail: normalized }));

  const frameWindow = options.frameWindow;
  if (frameWindow && typeof frameWindow.postMessage === 'function') {
    frameWindow.postMessage({
      source: 'hermes-agent-os',
      type: ROOM_ACT_EVENT,
      detail: normalized
    }, options.targetOrigin || '*');
  }

  return normalized;
}

export { ROOM_ACT_EVENT, AGENT_OS_EVENT };
