<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe2,
  Home,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2
} from 'lucide-vue-next';
import { agentOsRuntimeHttpUrl } from '../modules/agentOs/runtimeUrls';
import {
  AGENT_OS_SEARCH_URL_PREFIX,
  buildAgentOsSearchUrl,
  isAgentOsSearchUrl,
  normalizeBrowserSearchQuery
} from '../services/browserNavigation';

const HOME_URL = 'agentos://home';
const SEARCH_URL_PREFIX = AGENT_OS_SEARCH_URL_PREFIX;
const HISTORY_STORAGE_KEY = 'hermesAgentOsBrowserHistory:v1';
const MAX_HISTORY_ITEMS = 24;
const SEARCH_TIMEOUT_MS = 12000;
const SEARCH_PROXY_ENDPOINT = agentOsRuntimeHttpUrl('browser/search');

const quickLinks = [
  { label: 'Hermes Docs', url: 'https://hermes-agent.nousresearch.com/docs' },
  { label: 'MDN', url: 'https://developer.mozilla.org/' },
  { label: 'GitHub', url: 'https://github.com/' },
  { label: 'Agent OS', url: window.location.origin }
];

function readHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter((item) => item?.url).slice(0, MAX_HISTORY_ITEMS) : [];
  } catch (_) {
    return [];
  }
}

function writeHistory(items) {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
}

function titleFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '') || url;
  } catch (_) {
    return url;
  }
}

function detailFromUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch (_) {
    return url;
  }
}

function isLocalHost(value) {
  return /^(localhost|127(?:\.\d{1,3}){3})(:\d+)?([/?#].*)?$/i.test(value);
}

function isLikelyHost(value) {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#].*)?$/i.test(value);
}

function searchUrl(query) {
  return buildAgentOsSearchUrl(query);
}

function isSearchUrl(url) {
  return isAgentOsSearchUrl(url);
}

function queryFromSearchUrl(url) {
  if (!isSearchUrl(url)) return '';
  return normalizeBrowserSearchQuery(url);
}

function normalizeAddressInput(input) {
  const value = input.trim();
  if (!value) return HOME_URL;
  if (value === HOME_URL) return HOME_URL;
  if (isSearchUrl(value)) return searchUrl(value);

  let candidate = '';
  if (/^https?:\/\//i.test(value)) candidate = value;
  else if (isLocalHost(value)) candidate = `http://${value}`;
  else if (!/\s/.test(value) && isLikelyHost(value)) candidate = `https://${value}`;
  else return searchUrl(value);

  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : searchUrl(value);
  } catch (_) {
    return searchUrl(value);
  }
}

const address = ref('');
const frameSrc = ref('');
const frameKey = ref(0);
const loading = ref(false);
const frameError = ref(false);
const recentItems = ref(readHistory());
const navStack = ref([{ url: HOME_URL, title: '首页', at: Date.now() }]);
const navIndex = ref(0);
const loadTimer = ref(0);
const frameElement = ref(null);
const searchResults = ref([]);
const searchLoading = ref(false);
const searchError = ref('');
const activeSearchToken = ref(0);

const activeEntry = computed(() => navStack.value[navIndex.value] || navStack.value[0]);
const isHome = computed(() => activeEntry.value?.url === HOME_URL);
const isSearch = computed(() => isSearchUrl(activeEntry.value?.url));
const currentSearchQuery = computed(() => queryFromSearchUrl(activeEntry.value?.url));
const currentUrl = computed(() => (isHome.value || isSearch.value ? '' : activeEntry.value?.url || ''));
const canGoBack = computed(() => navIndex.value > 0);
const canGoForward = computed(() => navIndex.value < navStack.value.length - 1);
const canOpenExternal = computed(() => Boolean(currentUrl.value));
const currentDomain = computed(() => (currentUrl.value ? titleFromUrl(currentUrl.value) : 'Home'));

function clearLoadTimer() {
  if (!loadTimer.value) return;
  window.clearTimeout(loadTimer.value);
  loadTimer.value = 0;
}

function recordVisit(url) {
  if (!url || url === HOME_URL || isSearchUrl(url)) return;
  const next = [
    { url, title: titleFromUrl(url), detail: detailFromUrl(url), at: Date.now() },
    ...recentItems.value.filter((item) => item.url !== url)
  ].slice(0, MAX_HISTORY_ITEMS);
  recentItems.value = next;
  writeHistory(next);
}

function applyEntry(entry) {
  clearLoadTimer();
  frameError.value = false;
  searchError.value = '';

  if (!entry || entry.url === HOME_URL) {
    address.value = '';
    frameSrc.value = '';
    loading.value = false;
    searchLoading.value = false;
    searchResults.value = [];
    return;
  }

  if (isSearchUrl(entry.url)) {
    const query = queryFromSearchUrl(entry.url);
    address.value = query;
    frameSrc.value = '';
    loading.value = false;
    return runSearch(query);
  }

  address.value = entry.url;
  frameSrc.value = entry.url;
  loading.value = true;
  frameKey.value += 1;
  loadTimer.value = window.setTimeout(() => {
    loading.value = false;
    frameError.value = true;
  }, 12000);
}

function navigateTo(url, options = {}) {
  const normalizedUrl = url === HOME_URL ? HOME_URL : normalizeAddressInput(url);
  const searchQuery = queryFromSearchUrl(normalizedUrl);
  const entry = {
    url: normalizedUrl,
    title: normalizedUrl === HOME_URL ? '首页' : searchQuery ? `搜索：${searchQuery}` : titleFromUrl(normalizedUrl),
    at: Date.now()
  };

  if (options.replace) {
    navStack.value.splice(navIndex.value, 1, entry);
  } else {
    navStack.value = [...navStack.value.slice(0, navIndex.value + 1), entry];
    navIndex.value = navStack.value.length - 1;
  }

  const navigation = applyEntry(entry);
  recordVisit(normalizedUrl);
  return navigation;
}

function submitAddress() {
  navigateTo(address.value);
}

function goBack() {
  if (!canGoBack.value) return;
  navIndex.value -= 1;
  applyEntry(activeEntry.value);
}

function goForward() {
  if (!canGoForward.value) return;
  navIndex.value += 1;
  applyEntry(activeEntry.value);
}

function refreshPage() {
  if (isHome.value) {
    navigateTo(HOME_URL, { replace: true });
    return;
  }
  if (isSearch.value) {
    runSearch(currentSearchQuery.value);
    return;
  }
  applyEntry(activeEntry.value);
}

function openExternal(url = currentUrl.value) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function openSearchResult(result) {
  if (!result?.url) return;
  navigateTo(result.url);
}

function onFrameLoad() {
  clearLoadTimer();
  loading.value = false;
  frameError.value = false;

  try {
    const nextUrl = frameElement.value?.contentWindow?.location?.href;
    if (nextUrl && nextUrl !== 'about:blank' && nextUrl !== currentUrl.value) {
      address.value = nextUrl;
      recordVisit(nextUrl);
    }
  } catch (_) {
    // Cross-origin iframe navigation is intentionally opaque in browsers.
  }
}

function onFrameError() {
  clearLoadTimer();
  loading.value = false;
  frameError.value = true;
}

function clearHistory() {
  recentItems.value = [];
  writeHistory([]);
}

function cleanSearchText(value) {
  return String(value || '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[[^\]]*]\([^)]*\)/g, '')
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

function normalizeProviderResults(items) {
  const seen = new Set();
  return items
    .filter((item) => item?.url && /^https?:\/\//i.test(item.url))
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, 8)
    .map((item) => ({
      title: cleanSearchText(item.title) || titleFromUrl(item.url),
      url: item.url,
      displayUrl: detailFromUrl(item.url),
      snippet: cleanSearchText(item.snippet || item.content || '').slice(0, 260)
    }));
}

async function fetchSearchResults(query) {
  const url = new URL(SEARCH_PROXY_ENDPOINT);
  url.searchParams.set('q', query);
  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: 'application/json' }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Agent OS search returned ${response.status}`);
  }
  return normalizeProviderResults(data.results || []);
}

async function runSearch(query) {
  const normalizedQuery = normalizeBrowserSearchQuery(query);
  if (!normalizedQuery) {
    searchResults.value = [];
    searchLoading.value = false;
    searchError.value = '';
    return [];
  }

  const token = Date.now();
  activeSearchToken.value = token;
  searchLoading.value = true;
  searchError.value = '';
  searchResults.value = [];

  try {
    const results = await fetchSearchResults(normalizedQuery);
    if (activeSearchToken.value !== token) return [];
    searchResults.value = results;
    searchError.value = results.length ? '' : 'Agent OS 搜索没有找到可显示的结果';
    return results;
  } catch (_) {
    if (activeSearchToken.value !== token) return [];
    searchResults.value = [];
    searchError.value = 'Agent OS 本地搜索没有连接，请确认本地桥接服务正在运行';
    return [];
  } finally {
    if (activeSearchToken.value === token) searchLoading.value = false;
  }
}

onBeforeUnmount(() => {
  clearLoadTimer();
});

defineExpose({
  open: (url = '') => {
    navigateTo(String(url || HOME_URL));
    return { url: activeEntry.value?.url, title: activeEntry.value?.title };
  },
  search: async (query = '') => {
    const results = await navigateTo(searchUrl(String(query || '')));
    return { query: currentSearchQuery.value, results };
  },
  home: () => {
    navigateTo(HOME_URL);
    return { url: HOME_URL };
  },
  state: () => ({
    url: activeEntry.value?.url || HOME_URL,
    title: activeEntry.value?.title || '首页',
    isHome: isHome.value,
    isSearch: isSearch.value,
    searchQuery: currentSearchQuery.value,
    history: recentItems.value
  })
});
</script>

<template>
  <section class="browser-panel">
    <form class="browser-toolbar" @submit.prevent="submitAddress">
      <div class="browser-nav">
        <button type="button" title="后退" :disabled="!canGoBack" @click="goBack">
          <ArrowLeft :size="16" />
        </button>
        <button type="button" title="前进" :disabled="!canGoForward" @click="goForward">
          <ArrowRight :size="16" />
        </button>
        <button type="button" title="刷新" @click="refreshPage">
          <RefreshCw :size="16" />
        </button>
        <button type="button" title="首页" @click="navigateTo(HOME_URL)">
          <Home :size="16" />
        </button>
      </div>

      <label class="browser-address">
        <Search :size="15" />
        <input
          v-model="address"
          autocomplete="off"
          spellcheck="false"
          placeholder="搜索或输入网址"
          @keydown.enter.prevent="submitAddress"
        />
      </label>

      <button class="browser-open-btn" type="submit" title="打开">
        <Globe2 :size="16" />
      </button>
      <button class="browser-open-btn" type="button" title="在系统浏览器打开" :disabled="!canOpenExternal" @click="openExternal()">
        <ExternalLink :size="16" />
      </button>
    </form>

    <main class="browser-body">
      <section v-if="isHome" class="browser-home">
        <div class="browser-home-head">
          <span><Globe2 :size="28" /></span>
          <strong>浏览器</strong>
          <small>Tsukuyomi Space</small>
        </div>

        <div class="browser-quick-grid" aria-label="快捷网站">
          <button v-for="link in quickLinks" :key="link.url" type="button" @click="navigateTo(link.url)">
            <span>{{ link.label.slice(0, 1) }}</span>
            <strong>{{ link.label }}</strong>
            <small>{{ titleFromUrl(link.url) }}</small>
          </button>
        </div>

        <section v-if="recentItems.length" class="browser-history">
          <header>
            <strong>最近访问</strong>
            <button type="button" title="清空历史" @click="clearHistory">
              <Trash2 :size="14" />
            </button>
          </header>
          <div class="browser-history-list">
            <button v-for="item in recentItems" :key="item.url" type="button" @click="navigateTo(item.url)">
              <span>
                <strong>{{ item.title }}</strong>
                <small>{{ item.detail }}</small>
              </span>
              <ExternalLink :size="14" />
            </button>
          </div>
        </section>
      </section>

      <section v-else-if="isSearch" class="browser-search-page">
        <header class="browser-search-head">
          <span><Search :size="18" /></span>
          <div>
            <strong>{{ currentSearchQuery }}</strong>
            <small>搜索结果</small>
          </div>
          <button type="button" @click="runSearch(currentSearchQuery)">
            <RefreshCw :size="14" />
            重新搜索
          </button>
        </header>

        <div v-if="searchLoading" class="browser-search-status">
          <Loader2 :size="18" />
          <span>搜索中</span>
        </div>

        <div v-else-if="searchError" class="browser-search-fallback">
          <div class="browser-search-status warning">
            <ShieldAlert :size="18" />
            <span>{{ searchError }}</span>
          </div>
          <button type="button" class="browser-result-card" @click="runSearch(currentSearchQuery)">
            <span>
              <strong>重新搜索</strong>
              <small>Agent OS Browser Search</small>
            </span>
            <RefreshCw :size="15" />
          </button>
        </div>

        <div v-else class="browser-result-list">
          <button
            v-for="result in searchResults"
            :key="result.url"
            type="button"
            class="browser-result-card"
            @click="openSearchResult(result)"
          >
            <span>
              <strong>{{ result.title }}</strong>
              <small>{{ result.displayUrl }}</small>
              <p v-if="result.snippet">{{ result.snippet }}</p>
            </span>
            <Globe2 :size="15" />
          </button>
        </div>
      </section>

      <section v-else class="browser-frame-area">
        <div v-if="loading" class="browser-loading">
          <Loader2 :size="18" />
          <span>载入中</span>
        </div>
        <iframe
          :key="frameKey"
          ref="frameElement"
          class="browser-frame"
          :src="frameSrc"
          referrerpolicy="no-referrer"
          allow="clipboard-read; clipboard-write; fullscreen; geolocation; microphone; camera"
          @load="onFrameLoad"
          @error="onFrameError"
        ></iframe>
        <footer class="browser-frame-footer" :class="{ warning: frameError }">
          <span>
            <ShieldAlert :size="14" />
            {{ frameError ? '页面可能拒绝嵌入' : currentDomain }}
          </span>
          <button type="button" @click="openExternal()">
            <ExternalLink :size="14" />
            外部打开
          </button>
        </footer>
      </section>
    </main>
  </section>
</template>
