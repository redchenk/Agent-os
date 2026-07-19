import {
  dispatchRoomLive2D,
  inferLive2DIntentFromText,
  normalizeLive2DIntent
} from './live2dControl.js';
import { createLive2DSpeechPlayer } from './live2dSpeech.js';
import {
  alignLive2DIntentToStreamingSpeech,
  createLive2DStreamingSpeechSession
} from './live2dStreamingSpeechSession.js';
import { readRoomTTSSettings } from './roomSettings.js';
import { createAgentLive2DSpeechCore } from './agentLive2DSpeechCore.js';

export function createAgentLive2DSpeech(options = {}) {
  return createAgentLive2DSpeechCore({
    createSpeechPlayer: createLive2DSpeechPlayer,
    createSpeechSession: createLive2DStreamingSpeechSession,
    normalizeIntent: normalizeLive2DIntent,
    inferIntent: inferLive2DIntentFromText,
    alignIntent: alignLive2DIntentToStreamingSpeech,
    dispatchLive2D: dispatchRoomLive2D,
    isEnabled: () => readRoomTTSSettings().enabled,
    ...options
  });
}
