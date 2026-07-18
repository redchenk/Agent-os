import { computed, reactive } from 'vue';
import {
  loadMusicLyrics,
  readMusicPreferences,
  resolveMusicTrack,
  saveMusicPreferences
} from './musicPlatform';
import { isAudioPriming, primeAudioForAsyncPlayback } from './musicPlaybackGesture';

const preferences = readMusicPreferences();
const playerState = reactive({
  current: null,
  queue: [],
  history: Array.isArray(preferences.history) ? preferences.history : [],
  favorites: Array.isArray(preferences.favorites) ? preferences.favorites : [],
  playing: false,
  loading: false,
  currentTime: 0,
  duration: 0,
  volume: Number(preferences.volume ?? 0.82),
  quality: preferences.quality || 'high',
  repeat: preferences.repeat || 'all',
  shuffle: Boolean(preferences.shuffle),
  error: '',
  lyrics: '',
  translatedLyrics: '',
  playback: null
});

let audio = null;

function ensureAudio() {
  if (audio) return audio;
  if (typeof window === 'undefined') throw new Error('音乐播放仅在桌面窗口中可用。');
  audio = new Audio();
  audio.preload = 'auto';
  audio.volume = playerState.volume;
  audio.addEventListener('timeupdate', () => {
    playerState.currentTime = Number(audio.currentTime || 0);
  });
  audio.addEventListener('durationchange', () => {
    playerState.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  });
  audio.addEventListener('play', () => {
    if (isAudioPriming(audio)) return;
    playerState.playing = true;
  });
  audio.addEventListener('pause', () => {
    playerState.playing = false;
  });
  audio.addEventListener('ended', () => {
    if (playerState.repeat === 'one') {
      audio.currentTime = 0;
      audio.play().catch(setPlaybackError);
      return;
    }
    playNext().catch(setPlaybackError);
  });
  audio.addEventListener('error', () => {
    if (isAudioPriming(audio)) return;
    if (audio?.error) setPlaybackError(new Error('音频流加载失败，请尝试其他音质或歌曲。'));
  });
  return audio;
}

function trackKey(track = {}) {
  return `${track.provider || 'netease'}:${track.id || ''}`;
}

function sameTrack(left, right) {
  return trackKey(left) === trackKey(right);
}

function setPlaybackError(error) {
  playerState.error = error?.message || String(error || '音乐播放失败。');
  playerState.loading = false;
  return playerState.error;
}

function persist() {
  saveMusicPreferences({
    quality: playerState.quality,
    volume: playerState.volume,
    repeat: playerState.repeat,
    shuffle: playerState.shuffle,
    favorites: playerState.favorites.slice(0, 200),
    history: playerState.history.slice(0, 100)
  });
}

function rememberTrack(track) {
  const next = [track, ...playerState.history.filter((item) => !sameTrack(item, track))].slice(0, 100);
  playerState.history.splice(0, playerState.history.length, ...next);
  persist();
}

async function hydrateLyrics(track) {
  playerState.lyrics = '';
  playerState.translatedLyrics = '';
  try {
    const result = await loadMusicLyrics(track);
    if (!sameTrack(playerState.current, track)) return;
    playerState.lyrics = result.lyrics || '';
    playerState.translatedLyrics = result.translatedLyrics || '';
  } catch (_) {
    // Lyrics are optional and should not interrupt playback.
  }
}

export async function playMusicTrack(track, options = {}) {
  if (!track?.id) throw new Error('请选择一首歌曲。');
  const player = ensureAudio();
  let playbackPriming = primeAudioForAsyncPlayback(player);
  playerState.loading = true;
  playerState.error = '';

  try {
    const result = await resolveMusicTrack(track, options.quality || playerState.quality);
    if (!result.playback?.url) throw new Error('音乐平台没有返回可播放地址。');
    await playbackPriming?.ready.catch(() => {});
    playbackPriming?.release();
    playbackPriming = null;
    player.pause();
    player.src = result.playback.url;
    player.currentTime = 0;
    player.volume = playerState.volume;
    playerState.current = { ...track, ...result.track };
    playerState.playback = result.playback;
    playerState.duration = Number(track.duration || 0) / 1000;
    if (Array.isArray(options.queue)) {
      playerState.queue.splice(0, playerState.queue.length, ...options.queue);
    } else if (!playerState.queue.some((item) => sameTrack(item, track))) {
      playerState.queue.push(track);
    }
    rememberTrack(playerState.current);
    hydrateLyrics(playerState.current);
    await player.play();
    return publicMusicState();
  } catch (error) {
    playbackPriming?.release({ clearSource: true });
    setPlaybackError(error);
    throw error;
  } finally {
    playerState.loading = false;
  }
}

export async function toggleMusicPlayback(force) {
  const player = ensureAudio();
  const shouldPlay = typeof force === 'boolean' ? force : player.paused;
  playerState.error = '';
  if (shouldPlay) {
    if (!player.src) {
      const first = playerState.current || playerState.queue[0];
      if (!first) throw new Error('播放队列为空。');
      return playMusicTrack(first);
    }
    await player.play();
  } else {
    player.pause();
  }
  return publicMusicState();
}

function currentQueueIndex() {
  return playerState.queue.findIndex((item) => sameTrack(item, playerState.current));
}

export async function playNext() {
  if (!playerState.queue.length) {
    ensureAudio().pause();
    return publicMusicState();
  }
  let index;
  if (playerState.shuffle && playerState.queue.length > 1) {
    const current = currentQueueIndex();
    do index = Math.floor(Math.random() * playerState.queue.length);
    while (index === current);
  } else {
    index = currentQueueIndex() + 1;
    if (index >= playerState.queue.length) {
      if (playerState.repeat !== 'all') {
        ensureAudio().pause();
        return publicMusicState();
      }
      index = 0;
    }
  }
  return playMusicTrack(playerState.queue[index]);
}

export async function playPrevious() {
  const player = ensureAudio();
  if (player.currentTime > 4) {
    player.currentTime = 0;
    return publicMusicState();
  }
  if (!playerState.queue.length) return publicMusicState();
  let index = currentQueueIndex() - 1;
  if (index < 0) index = playerState.queue.length - 1;
  return playMusicTrack(playerState.queue[index]);
}

export function seekMusic(seconds) {
  const player = ensureAudio();
  const duration = Number.isFinite(player.duration) ? player.duration : playerState.duration;
  player.currentTime = Math.min(Math.max(0, Number(seconds) || 0), duration || 0);
  return player.currentTime;
}

export function setMusicVolume(value) {
  const volume = Math.min(1, Math.max(0, Number(value) || 0));
  playerState.volume = volume;
  if (audio) audio.volume = volume;
  persist();
  return volume;
}

export function setMusicQuality(value) {
  if (!['standard', 'high', 'lossless', 'hires'].includes(value)) return playerState.quality;
  playerState.quality = value;
  persist();
  return value;
}

export function setMusicRepeat(value) {
  playerState.repeat = ['off', 'all', 'one'].includes(value) ? value : 'all';
  persist();
  return playerState.repeat;
}

export function toggleMusicShuffle(value) {
  playerState.shuffle = typeof value === 'boolean' ? value : !playerState.shuffle;
  persist();
  return playerState.shuffle;
}

export function enqueueMusicTrack(track, mode = 'append') {
  if (!track?.id) return playerState.queue;
  const withoutTrack = playerState.queue.filter((item) => !sameTrack(item, track));
  if (mode === 'next') {
    const index = Math.max(0, currentQueueIndex() + 1);
    withoutTrack.splice(index, 0, track);
  } else {
    withoutTrack.push(track);
  }
  playerState.queue.splice(0, playerState.queue.length, ...withoutTrack);
  return playerState.queue;
}

export function removeMusicQueueTrack(track) {
  const index = playerState.queue.findIndex((item) => sameTrack(item, track));
  if (index >= 0) playerState.queue.splice(index, 1);
  return playerState.queue;
}

export function clearMusicQueue() {
  const current = playerState.current;
  playerState.queue.splice(0, playerState.queue.length, ...(current ? [current] : []));
  return playerState.queue;
}

export function toggleMusicFavorite(track = playerState.current) {
  if (!track?.id) return false;
  const index = playerState.favorites.findIndex((item) => sameTrack(item, track));
  if (index >= 0) playerState.favorites.splice(index, 1);
  else playerState.favorites.unshift(track);
  persist();
  return index < 0;
}

export function isMusicFavorite(track) {
  return playerState.favorites.some((item) => sameTrack(item, track));
}

export function publicMusicState() {
  return {
    current: playerState.current,
    playing: playerState.playing,
    loading: playerState.loading,
    currentTime: playerState.currentTime,
    duration: playerState.duration,
    volume: playerState.volume,
    quality: playerState.quality,
    repeat: playerState.repeat,
    shuffle: playerState.shuffle,
    queue: playerState.queue.slice(),
    error: playerState.error
  };
}

export function useMusicPlayer() {
  return {
    state: playerState,
    favorite: computed(() => isMusicFavorite(playerState.current)),
    play: playMusicTrack,
    toggle: toggleMusicPlayback,
    next: playNext,
    previous: playPrevious,
    seek: seekMusic,
    setVolume: setMusicVolume,
    setQuality: setMusicQuality,
    setRepeat: setMusicRepeat,
    toggleShuffle: toggleMusicShuffle,
    enqueue: enqueueMusicTrack,
    removeFromQueue: removeMusicQueueTrack,
    clearQueue: clearMusicQueue,
    toggleFavorite: toggleMusicFavorite,
    snapshot: publicMusicState
  };
}
