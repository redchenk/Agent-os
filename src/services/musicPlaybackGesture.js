const SILENT_AUDIO_DATA_URL = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
const primingPlayers = new WeakSet();

export function isAudioPriming(player) {
  return Boolean(player && primingPlayers.has(player));
}

export function primeAudioForAsyncPlayback(player) {
  const existingSource = player?.getAttribute?.('src') || player?.currentSrc || '';
  if (!player || !player.paused || existingSource) return null;

  primingPlayers.add(player);
  player.loop = true;
  player.src = SILENT_AUDIO_DATA_URL;

  let ready;
  try {
    ready = Promise.resolve(player.play());
  } catch (error) {
    ready = Promise.reject(error);
  }
  // The real stream play call reports a useful error if priming is denied.
  ready.catch(() => {});

  let released = false;
  return {
    ready,
    release({ clearSource = false } = {}) {
      if (released) return;
      released = true;
      primingPlayers.delete(player);
      player.pause();
      player.loop = false;
      if (clearSource) {
        player.removeAttribute?.('src');
        player.load?.();
      }
    }
  };
}
