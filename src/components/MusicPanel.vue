<script setup>
import {
  ChevronDown,
  Clock3,
  Disc3,
  Heart,
  History,
  ListMusic,
  LoaderCircle,
  LogOut,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  UserRound,
  Volume1,
  Volume2,
  X
} from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  MUSIC_PROVIDERS,
  checkNeteaseMusicLogin,
  clearMusicAccount,
  completeNeteaseMusicLogin,
  formatTrackDuration,
  loadMusicRecommendations,
  musicProviderMeta,
  readMusicAccount,
  saveMusicPreferences,
  searchMusic,
  startNeteaseMusicLogin,
  validateMusicAccount
} from '../services/musicPlatform';
import { useMusicPlayer } from '../services/musicPlayer';

const player = useMusicPlayer();
const provider = ref('netease');
const activeView = ref('home');
const searchQuery = ref('');
const searchResults = ref([]);
const recommendations = ref([]);
const busy = ref(false);
const message = ref('');
const queueOpen = ref(true);
const lyricsOpen = ref(false);
const accountDialogOpen = ref(false);
const accountProvider = ref('netease');
const credentialText = ref('');
const accountBusy = ref(false);
const qrLogin = reactive({ key: '', image: '', status: '', error: '' });
const accountRevision = ref(0);
let qrPollTimer = 0;

const providerMeta = computed(() => musicProviderMeta(provider.value));
const activeAccount = computed(() => {
  accountRevision.value;
  return readMusicAccount(provider.value);
});
const dialogAccount = computed(() => {
  accountRevision.value;
  return readMusicAccount(accountProvider.value);
});
const visibleLibrary = computed(() => activeView.value === 'favorites'
  ? player.state.favorites
  : player.state.history);
const progressPercent = computed(() => player.state.duration > 0
  ? Math.min(100, (player.state.currentTime / player.state.duration) * 100)
  : 0);
const currentCoverStyle = computed(() => player.state.current?.cover
  ? { backgroundImage: `url("${player.state.current.cover.replace(/"/g, '%22')}")` }
  : {});
const heroTrack = computed(() => player.state.current || recommendations.value[0] || null);
const heroCoverStyle = computed(() => heroTrack.value?.cover
  ? { backgroundImage: `url("${heroTrack.value.cover.replace(/"/g, '%22')}")` }
  : {});
const repeatIcon = computed(() => player.state.repeat === 'one' ? Repeat1 : Repeat);

function readablePlaybackError(error) {
  const value = error?.message || String(error || '');
  if (/user didn't interact|notallowederror|play\(\) failed/i.test(value)) {
    return '歌曲已加载，请点击底部播放按钮开始播放。';
  }
  return value || '播放失败，请稍后重试。';
}

function accountLabel(id) {
  const account = readMusicAccount(id);
  return account.connected ? account.account?.name || '已连接' : '未连接';
}

function selectProvider(id) {
  provider.value = id;
  saveMusicPreferences({ provider: id });
  message.value = '';
  if (activeView.value === 'home') loadRecommendations();
  else if (activeView.value === 'search' && searchQuery.value.trim()) runSearch();
}

async function loadRecommendations() {
  busy.value = true;
  message.value = '';
  try {
    const result = await loadMusicRecommendations(provider.value, 18);
    recommendations.value = result.tracks || [];
  } catch (error) {
    message.value = error?.message || '推荐内容加载失败。';
  } finally {
    busy.value = false;
  }
}

async function runSearch(options = {}) {
  const query = String(options.query ?? searchQuery.value).trim();
  if (!query) return [];
  searchQuery.value = query;
  activeView.value = 'search';
  busy.value = true;
  message.value = '';
  try {
    const result = await searchMusic(options.provider || provider.value, query, 30);
    searchResults.value = result.tracks || [];
    if (options.playFirst && searchResults.value[0]) {
      await playTrack(searchResults.value[0], searchResults.value);
    }
    return searchResults.value;
  } catch (error) {
    message.value = error?.message || '搜索失败。';
    throw error;
  } finally {
    busy.value = false;
  }
}

async function playTrack(track, list = null) {
  message.value = '';
  try {
    await player.play(track, Array.isArray(list) ? { queue: list } : {});
    return player.snapshot();
  } catch (error) {
    message.value = readablePlaybackError(error);
    throw error;
  }
}

async function togglePlayback() {
  message.value = '';
  try {
    await player.toggle();
  } catch (error) {
    message.value = readablePlaybackError(error);
  }
}

async function playHero() {
  if (heroTrack.value) await playTrack(heroTrack.value, recommendations.value);
}

function cycleRepeat() {
  const next = { off: 'all', all: 'one', one: 'off' }[player.state.repeat] || 'all';
  player.setRepeat(next);
}

function switchView(view) {
  activeView.value = view;
  message.value = '';
}

function openAccountDialog(id = provider.value) {
  accountProvider.value = id;
  credentialText.value = readMusicAccount(id).cookie || '';
  accountDialogOpen.value = true;
  resetQrLogin();
}

function closeAccountDialog() {
  accountDialogOpen.value = false;
  resetQrLogin();
}

function resetQrLogin() {
  window.clearInterval(qrPollTimer);
  qrPollTimer = 0;
  Object.assign(qrLogin, { key: '', image: '', status: '', error: '' });
}

async function startQrLogin() {
  resetQrLogin();
  accountBusy.value = true;
  try {
    const result = await startNeteaseMusicLogin();
    qrLogin.key = result.key;
    qrLogin.image = result.qrImage;
    qrLogin.status = '请使用网易云音乐 App 扫码';
    qrPollTimer = window.setInterval(pollQrLogin, 1800);
  } catch (error) {
    qrLogin.error = error?.message || '二维码创建失败。';
  } finally {
    accountBusy.value = false;
  }
}

async function pollQrLogin() {
  if (!qrLogin.key) return;
  try {
    const result = await checkNeteaseMusicLogin(qrLogin.key);
    if (result.code === 800) {
      qrLogin.status = '二维码已过期，请重新生成';
      window.clearInterval(qrPollTimer);
    } else if (result.code === 802) {
      qrLogin.status = '已扫码，请在手机上确认';
    } else if (result.code === 803 && result.cookie) {
      window.clearInterval(qrPollTimer);
      await completeNeteaseMusicLogin(result.cookie);
      accountRevision.value += 1;
      qrLogin.status = '登录成功';
      credentialText.value = result.cookie;
      window.setTimeout(closeAccountDialog, 700);
      loadRecommendations();
    }
  } catch (error) {
    qrLogin.error = error?.message || '登录状态检查失败。';
  }
}

async function connectCredential() {
  const cookie = credentialText.value.trim();
  if (!cookie) {
    qrLogin.error = '请粘贴网页登录凭证。';
    return;
  }
  accountBusy.value = true;
  qrLogin.error = '';
  try {
    const result = await validateMusicAccount(accountProvider.value, cookie);
    if (!result.connected) throw new Error('凭证无效或已经过期。');
    accountRevision.value += 1;
    closeAccountDialog();
    if (accountProvider.value === provider.value) loadRecommendations();
  } catch (error) {
    qrLogin.error = error?.message || '账号连接失败。';
  } finally {
    accountBusy.value = false;
  }
}

function disconnectAccount() {
  clearMusicAccount(accountProvider.value);
  accountRevision.value += 1;
  credentialText.value = '';
  resetQrLogin();
}

function currentTimeLabel(value) {
  return formatTrackDuration(Number(value || 0) * 1000);
}

function lyricLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\[[^\]]+]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 80);
}

async function petSearch(query, options = {}) {
  const selectedProvider = options.provider || provider.value;
  if (selectedProvider !== provider.value) selectProvider(selectedProvider);
  return runSearch({ query, provider: selectedProvider, playFirst: Boolean(options.playFirst) });
}

async function petPlay(query, options = {}) {
  if (query && typeof query === 'object') return playTrack(query);
  const results = await petSearch(String(query || ''), { ...options, playFirst: false });
  if (!results[0]) throw new Error(`没有找到“${query}”。`);
  return playTrack(results[0], results);
}

defineExpose({
  search: petSearch,
  play: petPlay,
  playTrack,
  pause: () => player.toggle(false),
  resume: () => player.toggle(true),
  toggle: () => player.toggle(),
  next: () => player.next(),
  previous: () => player.previous(),
  enqueue: (track, mode) => player.enqueue(track, mode),
  queue: () => player.state.queue.slice(),
  nowPlaying: () => player.snapshot(),
  favorite: (track) => player.toggleFavorite(track),
  setVolume: (value) => player.setVolume(value),
  openAccount: openAccountDialog
});

watch(() => player.state.error, (value) => {
  if (value) message.value = readablePlaybackError(value);
});

onMounted(() => {
  const savedProvider = localStorage.getItem('agentOsMusicLastProvider');
  if (MUSIC_PROVIDERS.some((item) => item.id === savedProvider)) provider.value = savedProvider;
  loadRecommendations();
});

watch(provider, (value) => localStorage.setItem('agentOsMusicLastProvider', value));
onBeforeUnmount(resetQrLogin);
</script>

<template>
  <section class="music-app-shell">
    <aside class="music-sidebar">
      <div class="music-brand">
        <span><Music2 :size="19" /></span>
        <strong>音律</strong>
      </div>

      <nav class="music-nav" aria-label="音乐导航">
        <button type="button" :class="{ active: activeView === 'home' }" @click="switchView('home')">
          <Sparkles :size="17" /> 为你推荐
        </button>
        <button type="button" :class="{ active: activeView === 'search' }" @click="switchView('search')">
          <Search :size="17" /> 搜索
        </button>
        <p>音乐库</p>
        <button type="button" :class="{ active: activeView === 'favorites' }" @click="switchView('favorites')">
          <Heart :size="17" /> 我喜欢
          <span>{{ player.state.favorites.length }}</span>
        </button>
        <button type="button" :class="{ active: activeView === 'history' }" @click="switchView('history')">
          <History :size="17" /> 最近播放
        </button>
      </nav>

      <div class="music-account-list">
        <p>音乐平台</p>
        <div
          v-for="item in MUSIC_PROVIDERS"
          :key="item.id"
          :class="{ active: provider === item.id }"
          @click="selectProvider(item.id)"
        >
          <span class="music-provider-mark" :style="{ background: item.accent }">{{ item.id === 'netease' ? 'N' : 'Q' }}</span>
          <span><strong>{{ item.shortName }}</strong><small>{{ accountLabel(item.id) }}</small></span>
          <button type="button" title="账号设置" @click.stop="openAccountDialog(item.id)"><UserRound :size="14" /></button>
        </div>
      </div>
    </aside>

    <main class="music-main">
      <header class="music-toolbar">
        <form class="music-search" @submit.prevent="runSearch()">
          <Search :size="17" />
          <input v-model="searchQuery" placeholder="搜索歌曲、歌手或专辑" aria-label="搜索音乐" />
          <button class="music-search-submit" type="submit" :disabled="busy || !searchQuery.trim()">
            <LoaderCircle v-if="busy" :size="14" />
            <span>{{ busy ? '搜索中' : '搜索' }}</span>
          </button>
        </form>
        <button class="music-account-chip" type="button" @click="openAccountDialog(provider)">
          <span class="music-provider-mark" :style="{ background: providerMeta.accent }">{{ provider === 'netease' ? 'N' : 'Q' }}</span>
          <span>{{ activeAccount.connected ? activeAccount.account?.name || '已连接' : `登录${providerMeta.shortName}` }}</span>
          <ChevronDown :size="14" />
        </button>
      </header>

      <div class="music-content" :class="{ 'with-queue': queueOpen }">
        <div class="music-view">
          <div v-if="message" class="music-inline-message">
            <span>{{ message }}</span>
            <button type="button" title="关闭提示" @click="message = ''"><X :size="14" /></button>
          </div>

          <template v-if="activeView === 'home'">
            <section class="music-hero" :style="heroCoverStyle">
              <div class="music-hero-copy">
                <span>{{ activeAccount.connected ? '你的每日精选' : `${providerMeta.shortName} 热门新歌` }}</span>
                <h2>{{ heroTrack?.title || '发现今天的声音' }}</h2>
                <p>{{ heroTrack ? `${heroTrack.artist}${heroTrack.album ? ` · ${heroTrack.album}` : ''}` : '登录音乐平台后获取专属推荐' }}</p>
                <button type="button" :disabled="!heroTrack" @click="playHero"><Play :size="16" fill="currentColor" /> 播放</button>
              </div>
            </section>

            <section class="music-section">
              <div class="music-section-title">
                <div><span>FOR YOU</span><h3>今日推荐</h3></div>
                <button type="button" @click="loadRecommendations">换一批</button>
              </div>
              <div v-if="busy && !recommendations.length" class="music-loading"><LoaderCircle :size="22" /> 正在获取音乐</div>
              <div v-else class="music-album-grid">
                <button v-for="track in recommendations.slice(0, 10)" :key="`${track.provider}:${track.id}`" type="button" @click="playTrack(track, recommendations)">
                  <span class="music-cover">
                    <img v-if="track.cover" :src="track.cover" :alt="`${track.title}封面`" />
                    <Disc3 v-else :size="32" />
                    <i><Play :size="16" fill="currentColor" /></i>
                  </span>
                  <strong>{{ track.title }}</strong>
                  <small>{{ track.artist }}</small>
                </button>
              </div>
            </section>
          </template>

          <template v-else-if="activeView === 'search'">
            <section class="music-list-section">
              <div class="music-section-title">
                <div><span>SEARCH</span><h3>{{ searchQuery ? `“${searchQuery}”的搜索结果` : '搜索音乐' }}</h3></div>
                <small>{{ searchResults.length ? `${searchResults.length} 首` : '' }}</small>
              </div>
              <div v-if="busy" class="music-loading"><LoaderCircle :size="22" /> 正在搜索</div>
              <div v-else-if="!searchResults.length" class="music-empty"><Search :size="30" /><strong>搜索你想听的音乐</strong></div>
              <div v-else class="music-track-list">
                <div v-for="(track, index) in searchResults" :key="`${track.provider}:${track.id}`" @dblclick="playTrack(track, searchResults)">
                  <span class="music-index">{{ String(index + 1).padStart(2, '0') }}</span>
                  <span class="music-track-cover"><img v-if="track.cover" :src="track.cover" alt="" /><Disc3 v-else :size="20" /></span>
                  <span class="music-track-title"><strong>{{ track.title }}</strong><small>{{ track.artist }}</small></span>
                  <span class="music-track-album">{{ track.album || '单曲' }}</span>
                  <span v-if="track.vip" class="music-vip">VIP</span>
                  <span class="music-track-duration">{{ formatTrackDuration(track.duration) }}</span>
                  <span class="music-row-actions">
                    <button type="button" title="添加到下一首" @click.stop="player.enqueue(track, 'next')"><Plus :size="15" /></button>
                    <button type="button" title="播放" @click.stop="playTrack(track, searchResults)"><Play :size="15" fill="currentColor" /></button>
                  </span>
                </div>
              </div>
            </section>
          </template>

          <template v-else>
            <section class="music-list-section">
              <div class="music-section-title">
                <div><span>LIBRARY</span><h3>{{ activeView === 'favorites' ? '我喜欢的音乐' : '最近播放' }}</h3></div>
                <small>{{ visibleLibrary.length }} 首</small>
              </div>
              <div v-if="!visibleLibrary.length" class="music-empty">
                <Heart v-if="activeView === 'favorites'" :size="30" />
                <Clock3 v-else :size="30" />
                <strong>{{ activeView === 'favorites' ? '收藏的音乐会出现在这里' : '播放记录会出现在这里' }}</strong>
              </div>
              <div v-else class="music-track-list">
                <div v-for="(track, index) in visibleLibrary" :key="`${track.provider}:${track.id}`" @dblclick="playTrack(track, visibleLibrary)">
                  <span class="music-index">{{ String(index + 1).padStart(2, '0') }}</span>
                  <span class="music-track-cover"><img v-if="track.cover" :src="track.cover" alt="" /><Disc3 v-else :size="20" /></span>
                  <span class="music-track-title"><strong>{{ track.title }}</strong><small>{{ track.artist }}</small></span>
                  <span class="music-track-album">{{ track.album || providerMeta.shortName }}</span>
                  <span class="music-track-duration">{{ formatTrackDuration(track.duration) }}</span>
                  <span class="music-row-actions"><button type="button" title="播放" @click.stop="playTrack(track, visibleLibrary)"><Play :size="15" fill="currentColor" /></button></span>
                </div>
              </div>
            </section>
          </template>
        </div>

        <aside v-if="queueOpen" class="music-queue-panel">
          <header><div><ListMusic :size="17" /><strong>播放队列</strong><span>{{ player.state.queue.length }}</span></div><button type="button" title="关闭队列" @click="queueOpen = false"><X :size="15" /></button></header>
          <div class="music-queue-list">
            <div
              v-for="track in player.state.queue"
              :key="`${track.provider}:${track.id}`"
              :class="{ active: player.state.current?.id === track.id && player.state.current?.provider === track.provider }"
              @dblclick="playTrack(track)"
            >
              <span><img v-if="track.cover" :src="track.cover" alt="" /><Disc3 v-else :size="18" /></span>
              <span><strong>{{ track.title }}</strong><small>{{ track.artist }}</small></span>
              <button type="button" title="从队列移除" @click.stop="player.removeFromQueue(track)"><X :size="13" /></button>
            </div>
          </div>
          <button v-if="player.state.queue.length > 1" class="music-clear-queue" type="button" @click="player.clearQueue"><Trash2 :size="14" /> 清空队列</button>
        </aside>
      </div>

      <footer class="music-player-bar">
        <div class="music-now-playing">
          <span class="music-now-cover" :style="currentCoverStyle"><Disc3 v-if="!player.state.current?.cover" :size="24" /></span>
          <span><strong>{{ player.state.current?.title || '尚未播放' }}</strong><small>{{ player.state.current?.artist || '从推荐或搜索结果中选择音乐' }}</small></span>
          <button type="button" :class="{ active: player.favorite.value }" title="收藏" :disabled="!player.state.current" @click="player.toggleFavorite()"><Heart :size="17" :fill="player.favorite.value ? 'currentColor' : 'none'" /></button>
        </div>
        <div class="music-transport">
          <div>
            <button type="button" :class="{ active: player.state.shuffle }" title="随机播放" @click="player.toggleShuffle()"><Shuffle :size="15" /></button>
            <button type="button" title="上一首" @click="player.previous"><SkipBack :size="18" fill="currentColor" /></button>
            <button class="music-play-toggle" type="button" :disabled="player.state.loading" :title="player.state.playing ? '暂停' : '播放'" @click="togglePlayback">
              <LoaderCircle v-if="player.state.loading" :size="19" />
              <Pause v-else-if="player.state.playing" :size="19" fill="currentColor" />
              <Play v-else :size="19" fill="currentColor" />
            </button>
            <button type="button" title="下一首" @click="player.next"><SkipForward :size="18" fill="currentColor" /></button>
            <button type="button" :class="{ active: player.state.repeat !== 'off' }" :title="`循环模式：${player.state.repeat}`" @click="cycleRepeat"><component :is="repeatIcon" :size="16" /></button>
          </div>
          <label class="music-progress">
            <span>{{ currentTimeLabel(player.state.currentTime) }}</span>
            <input type="range" min="0" :max="Math.max(player.state.duration, 1)" step="0.1" :value="player.state.currentTime" :style="{ '--progress': `${progressPercent}%` }" @input="player.seek($event.target.value)" />
            <span>{{ currentTimeLabel(player.state.duration) }}</span>
          </label>
        </div>
        <div class="music-player-tools">
          <button type="button" :class="{ active: lyricsOpen }" title="歌词" @click="lyricsOpen = !lyricsOpen">词</button>
          <button type="button" :class="{ active: queueOpen }" title="播放队列" @click="queueOpen = !queueOpen"><ListMusic :size="17" /></button>
          <label><Volume1 v-if="player.state.volume < 0.45" :size="17" /><Volume2 v-else :size="17" /><input type="range" min="0" max="1" step="0.01" :value="player.state.volume" @input="player.setVolume($event.target.value)" /></label>
          <select :value="player.state.quality" title="音质" @change="player.setQuality($event.target.value)"><option value="standard">标准</option><option value="high">高品质</option><option value="lossless">无损</option><option value="hires">Hi-Res</option></select>
        </div>
      </footer>

      <section v-if="lyricsOpen" class="music-lyrics-overlay">
        <button type="button" title="关闭歌词" @click="lyricsOpen = false"><X :size="16" /></button>
        <div class="music-lyrics-cover" :style="currentCoverStyle"><Disc3 v-if="!player.state.current?.cover" :size="48" /></div>
        <div><span>正在播放</span><h3>{{ player.state.current?.title || '暂无歌曲' }}</h3><p>{{ player.state.current?.artist }}</p><div class="music-lyrics-scroll"><p v-for="(line, index) in lyricLines(player.state.lyrics)" :key="index">{{ line }}</p><p v-if="!player.state.lyrics">播放歌曲后将在这里显示歌词</p></div></div>
      </section>
    </main>

    <div v-if="accountDialogOpen" class="music-modal-backdrop" @pointerdown.self="closeAccountDialog">
      <section class="music-account-modal">
        <header><div><span class="music-provider-mark" :style="{ background: musicProviderMeta(accountProvider).accent }">{{ accountProvider === 'netease' ? 'N' : 'Q' }}</span><span><strong>连接{{ musicProviderMeta(accountProvider).name }}</strong><small>账号仅保存在本机</small></span></div><button type="button" title="关闭" @click="closeAccountDialog"><X :size="16" /></button></header>
        <template v-if="dialogAccount.connected">
          <div class="music-account-connected"><UserRound :size="30" /><span><strong>{{ dialogAccount.account?.name || '音乐账号' }}</strong><small>{{ dialogAccount.account?.id }}</small></span></div>
          <button class="music-danger-button" type="button" @click="disconnectAccount"><LogOut :size="15" /> 退出此平台账号</button>
        </template>
        <template v-else-if="accountProvider === 'netease'">
          <div v-if="qrLogin.image" class="music-qr-login"><img :src="qrLogin.image" alt="网易云音乐登录二维码" /><strong>{{ qrLogin.status }}</strong><small>扫码确认后会自动完成连接</small></div>
          <button v-else class="music-primary-button" type="button" :disabled="accountBusy" @click="startQrLogin"><LoaderCircle v-if="accountBusy" :size="16" /><Radio v-else :size="16" /> 生成登录二维码</button>
          <div class="music-account-divider"><span>或使用网页登录凭证</span></div>
          <textarea v-model="credentialText" rows="3" placeholder="MUSIC_U=..." aria-label="网易云登录凭证"></textarea>
          <button class="music-secondary-button" type="button" :disabled="accountBusy" @click="connectCredential">连接账号</button>
        </template>
        <template v-else>
          <div class="music-login-note"><strong>连接 QQ 音乐账号</strong><p>在 QQ 音乐网页登录后，将本机 Cookie 凭证粘贴到下方。需要包含 uin 与 qqmusic_key 或 qm_keyst。</p></div>
          <textarea v-model="credentialText" rows="5" placeholder="uin=...; qqmusic_key=...; pgv_pvid=..." aria-label="QQ 音乐登录凭证"></textarea>
          <button class="music-primary-button" type="button" :disabled="accountBusy" @click="connectCredential"><LoaderCircle v-if="accountBusy" :size="16" /><UserRound v-else :size="16" /> 验证并连接</button>
        </template>
        <p v-if="qrLogin.error" class="music-account-error">{{ qrLogin.error }}</p>
      </section>
    </div>
  </section>
</template>
