import { createStreamingSpeechTextBuffer } from './live2dStreamingSpeechText.js';

function defaultDispatchCharacterState(mode, detail = {}) {
  window.dispatchEvent(new CustomEvent('tsukuyomi:live2d-character-state', {
    detail: { mode, ...detail }
  }));
}

export function createAgentLive2DSpeechCore(options = {}) {
  const createSpeechPlayer = options.createSpeechPlayer;
  const createSpeechSession = options.createSpeechSession;
  if (typeof createSpeechPlayer !== 'function' || typeof createSpeechSession !== 'function') {
    throw new TypeError('Speech player and session factories are required.');
  }
  const normalizeIntent = options.normalizeIntent || ((intent) => intent);
  const inferIntent = options.inferIntent || (() => null);
  const alignIntent = options.alignIntent || ((intent) => intent);
  const dispatchLive2D = options.dispatchLive2D || (() => {});
  const dispatchCharacterState = options.dispatchCharacterState || defaultDispatchCharacterState;
  const isEnabled = options.isEnabled || (() => true);
  const textBuffer = createStreamingSpeechTextBuffer(options.textBufferOptions);
  let generation = 0;
  let latestIntent = null;
  let speechSession = null;

  const speechPlayer = createSpeechPlayer({
    onState: (patch) => {
      speechSession?.handleSpeechStatePatch(patch);
      options.onState?.(patch);
    }
  });
  speechSession = createSpeechSession({
    dispatchCharacterState,
    isLiveDirectorRunning: options.isLiveDirectorRunning || (() => false)
  });

  function enabled() {
    try {
      return Boolean(isEnabled());
    } catch (_) {
      return false;
    }
  }

  function sentenceIntent(text) {
    return normalizeIntent(latestIntent || inferIntent(text) || {
      emotion: 'neutral',
      actions: ['look_at_chat', 'breathe'],
      durationMs: 2200
    });
  }

  function queueSentence(text) {
    if (!text || !enabled()) return null;
    const token = generation;
    speechSession.queueLine();
    const playback = speechPlayer.enqueue(text, {
      get emotion() {
        const intent = sentenceIntent(text);
        return intent?.emotion || intent?.expression || 'neutral';
      },
      get speechStyle() {
        const intent = sentenceIntent(text);
        return intent?.speechStyle || intent?.speech_style || null;
      },
      onStart: ({ durationMs = 0 }) => {
        if (token !== generation) return;
        const intent = sentenceIntent(text);
        const emotion = intent?.emotion || intent?.expression || 'neutral';
        if (intent) {
          const alignedIntent = alignIntent(intent, durationMs);
          const dispatchedIntent = dispatchLive2D(alignedIntent);
          options.onIntent?.(
            dispatchedIntent && typeof dispatchedIntent === 'object' ? dispatchedIntent : alignedIntent
          );
        }
        speechSession.lineStarted({ durationMs, emotion });
      }
    }).catch((error) => {
      if (error?.name !== 'AbortError') options.onError?.(error);
      return false;
    }).finally(() => {
      if (token === generation) speechSession.lineSettled();
    });
    return playback;
  }

  function queueChunks(chunks) {
    return chunks.map(queueSentence).filter(Boolean);
  }

  function stop(cancelOptions = {}) {
    generation += 1;
    speechSession.cancel({ dispatchState: cancelOptions.dispatchState !== false });
    speechPlayer.stop();
    textBuffer.reset();
    latestIntent = null;
  }

  return {
    begin() {
      generation += 1;
      speechSession.cancel();
      speechPlayer.stop();
      textBuffer.reset();
      latestIntent = null;
      speechSession.begin();
      dispatchCharacterState('thinking', { holdMs: 2600, attention: 0.84, arousal: 0.5 });
    },
    push(fragment) {
      return queueChunks(textBuffer.push(fragment));
    },
    finish(finalText = '') {
      const playback = queueChunks(textBuffer.finish(finalText));
      speechSession.finish({ delayMs: 520 });
      return playback;
    },
    setIntent(intent) {
      latestIntent = normalizeIntent(intent) || null;
    },
    playOnce(text, playOptions = {}) {
      return speechPlayer.play(text, playOptions);
    },
    warmup(warmupOptions = {}) {
      return speechPlayer.warmup?.(warmupOptions) || Promise.resolve(false);
    },
    stop,
    cancel: stop,
    destroy() {
      generation += 1;
      speechSession.cancel();
      speechPlayer.destroy();
      textBuffer.reset();
      latestIntent = null;
    },
    getText() {
      return textBuffer.getText();
    },
    isEnabled: enabled
  };
}
