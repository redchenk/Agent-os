<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  LocateFixed,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Sun,
  Trash2,
  Wind
} from 'lucide-vue-next';
import {
  geolocationErrorMessage,
  reverseGeocodeCoordinates
} from '../services/weatherLocation';

const WEATHER_LOCATIONS_STORAGE_KEY = 'hermesAgentOsWeatherLocations:v1';
const WEATHER_ACTIVE_STORAGE_KEY = 'hermesAgentOsWeatherActiveLocation:v1';
const WEATHER_UNIT_STORAGE_KEY = 'hermesAgentOsWeatherUnit:v1';

const defaultLocation = {
  id: 'default-shanghai',
  name: '上海',
  admin1: '上海市',
  country: '中国',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai'
};

const searchQuery = ref('');
const searchResults = ref([]);
const searchLoading = ref(false);
const loading = ref(false);
const locating = ref(false);
const errorText = ref('');
const forecast = ref(null);
const lastUpdated = ref(0);
const locations = ref(readArray(WEATHER_LOCATIONS_STORAGE_KEY, [defaultLocation]));
const activeLocationId = ref(localStorage.getItem(WEATHER_ACTIVE_STORAGE_KEY) || locations.value[0]?.id || defaultLocation.id);
const unit = ref(localStorage.getItem(WEATHER_UNIT_STORAGE_KEY) || 'celsius');

const activeLocation = computed(() => (
  locations.value.find((location) => location.id === activeLocationId.value) || locations.value[0] || defaultLocation
));
const unitSymbol = computed(() => (unit.value === 'fahrenheit' ? '°F' : '°C'));
const current = computed(() => forecast.value?.current || null);
const currentMeta = computed(() => weatherMeta(current.value?.weather_code, current.value?.is_day));
const hourlyItems = computed(() => {
  const hourly = forecast.value?.hourly;
  if (!hourly?.time?.length) return [];
  return hourly.time.slice(0, 24).map((time, index) => ({
    time: formatHour(time),
    temp: round(hourly.temperature_2m?.[index]),
    pop: hourly.precipitation_probability?.[index] ?? 0,
    code: hourly.weather_code?.[index],
    isDay: hourly.is_day?.[index]
  }));
});
const dailyItems = computed(() => {
  const daily = forecast.value?.daily;
  if (!daily?.time?.length) return [];
  return daily.time.map((time, index) => {
    const meta = weatherMeta(daily.weather_code?.[index], 1);
    return {
      date: formatDay(time),
      high: round(daily.temperature_2m_max?.[index]),
      low: round(daily.temperature_2m_min?.[index]),
      pop: daily.precipitation_probability_max?.[index] ?? 0,
      wind: round(daily.wind_speed_10m_max?.[index]),
      uv: round(daily.uv_index_max?.[index]),
      sunrise: formatHour(daily.sunrise?.[index]),
      sunset: formatHour(daily.sunset?.[index]),
      ...meta
    };
  });
});
const detailItems = computed(() => {
  if (!current.value) return [];
  const uv = forecast.value?.daily?.uv_index_max?.[0];
  return [
    { label: '体感', value: `${round(current.value.apparent_temperature)}${unitSymbol.value}` },
    { label: '湿度', value: `${round(current.value.relative_humidity_2m)}%` },
    { label: '风速', value: `${round(current.value.wind_speed_10m)} km/h` },
    { label: '阵风', value: `${round(current.value.wind_gusts_10m)} km/h` },
    { label: '降水', value: `${round(current.value.precipitation)} mm` },
    { label: '云量', value: `${round(current.value.cloud_cover)}%` },
    { label: '气压', value: `${round(current.value.pressure_msl)} hPa` },
    { label: 'UV', value: Number.isFinite(uv) ? round(uv) : '-' }
  ];
});
const locationTitle = computed(() => formatLocation(activeLocation.value));
const updatedText = computed(() => lastUpdated.value ? `更新 ${new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}).format(lastUpdated.value)}` : '等待更新');

watch(locations, () => {
  localStorage.setItem(WEATHER_LOCATIONS_STORAGE_KEY, JSON.stringify(locations.value));
}, { deep: true });

watch(activeLocationId, () => {
  localStorage.setItem(WEATHER_ACTIVE_STORAGE_KEY, activeLocationId.value);
  fetchForecast();
});

watch(unit, () => {
  localStorage.setItem(WEATHER_UNIT_STORAGE_KEY, unit.value);
  fetchForecast();
});

onMounted(() => initializeWeather());

function readArray(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(value) && value.length ? value : fallback;
  } catch (_) {
    return fallback;
  }
}

function round(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return Math.round(number);
}

function weatherMeta(code, isDay = 1) {
  const value = Number(code);
  if (value === 0) return { label: '晴朗', icon: isDay ? Sun : Cloud };
  if ([1, 2].includes(value)) return { label: '少云', icon: CloudSun };
  if (value === 3) return { label: '多云', icon: Cloud };
  if ([45, 48].includes(value)) return { label: '雾', icon: CloudFog };
  if ([51, 53, 55, 56, 57].includes(value)) return { label: '毛毛雨', icon: CloudDrizzle };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return { label: '降雨', icon: CloudRain };
  if ([71, 73, 75, 77, 85, 86].includes(value)) return { label: '降雪', icon: CloudSnow };
  if ([95, 96, 99].includes(value)) return { label: '雷暴', icon: CloudLightning };
  return { label: '天气', icon: CloudSun };
}

function formatLocation(location) {
  return [...new Set([location.name, location.admin1, location.country].filter(Boolean))].join(' · ');
}

function formatHour(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function formatDay(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'short', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function locationId(location) {
  return String(location.id || `${location.latitude},${location.longitude}`);
}

async function searchLocations() {
  const query = searchQuery.value.trim();
  if (query.length < 2) {
    errorText.value = '至少输入 2 个字符搜索城市。';
    return;
  }
  searchLoading.value = true;
  errorText.value = '';
  try {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', query);
    url.searchParams.set('count', '8');
    url.searchParams.set('language', 'zh');
    url.searchParams.set('format', 'json');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`城市搜索失败：${response.status}`);
    const data = await response.json();
    searchResults.value = (data.results || []).map((item) => ({
      id: String(item.id),
      name: item.name,
      admin1: item.admin1,
      country: item.country,
      latitude: item.latitude,
      longitude: item.longitude,
      timezone: item.timezone || 'auto'
    }));
    if (!searchResults.value.length) errorText.value = '没有找到匹配城市。';
  } catch (error) {
    errorText.value = error?.message || '城市搜索失败。';
  } finally {
    searchLoading.value = false;
  }
}

function selectLocation(location) {
  const id = locationId(location);
  const stored = { ...location, id };
  const existingIndex = locations.value.findIndex((item) => locationId(item) === id);
  if (existingIndex >= 0) {
    locations.value = locations.value.map((item, index) => index === existingIndex ? stored : item);
  } else {
    locations.value = [...locations.value, stored];
  }
  activeLocationId.value = id;
  searchQuery.value = '';
  searchResults.value = [];
}

function removeLocation(locationIdValue) {
  if (locations.value.length <= 1) return;
  locations.value = locations.value.filter((location) => locationId(location) !== locationIdValue);
  if (activeLocationId.value === locationIdValue) activeLocationId.value = locations.value[0]?.id || defaultLocation.id;
}

function requestCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 300000
    });
  });
}

async function canRequestGeolocation() {
  if (!navigator.permissions?.query) return true;
  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' });
    return permission.state !== 'denied';
  } catch (_) {
    return true;
  }
}

async function initializeWeather() {
  if (navigator.geolocation && await canRequestGeolocation()) {
    const located = await useCurrentLocation({ silent: true });
    if (located) return;
  }
  await fetchForecast();
}

async function useCurrentLocation(options = {}) {
  if (!navigator.geolocation) {
    errorText.value = '浏览器不支持定位。';
    return false;
  }
  locating.value = true;
  errorText.value = '';
  try {
    const position = await requestCurrentPosition();
    const resolved = await reverseGeocodeCoordinates(
      position.coords.latitude,
      position.coords.longitude
    );
    const location = {
      ...resolved,
      id: 'current-location',
      isCurrent: true,
      accuracy: Math.round(position.coords.accuracy || 0)
    };
    const alreadyActive = activeLocationId.value === location.id;
    selectLocation(location);
    if (alreadyActive) await fetchForecast();
    return true;
  } catch (error) {
    if (!options.silent || Number(error?.code) !== 1) {
      errorText.value = Number(error?.code)
        ? geolocationErrorMessage(error)
        : error?.message || '无法识别当前城市。';
    }
    return false;
  } finally {
    locating.value = false;
  }
}

async function fetchForecast() {
  const location = activeLocation.value;
  if (!location) return;
  loading.value = true;
  errorText.value = '';
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(location.latitude));
    url.searchParams.set('longitude', String(location.longitude));
    url.searchParams.set('timezone', location.timezone || 'auto');
    url.searchParams.set('forecast_days', '7');
    url.searchParams.set('forecast_hours', '24');
    url.searchParams.set('temperature_unit', unit.value === 'fahrenheit' ? 'fahrenheit' : 'celsius');
    url.searchParams.set('wind_speed_unit', 'kmh');
    url.searchParams.set('precipitation_unit', 'mm');
    url.searchParams.set('current', [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'is_day',
      'precipitation',
      'weather_code',
      'cloud_cover',
      'pressure_msl',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m'
    ].join(','));
    url.searchParams.set('hourly', [
      'temperature_2m',
      'apparent_temperature',
      'precipitation_probability',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'uv_index',
      'is_day'
    ].join(','));
    url.searchParams.set('daily', [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'apparent_temperature_max',
      'apparent_temperature_min',
      'sunrise',
      'sunset',
      'uv_index_max',
      'precipitation_probability_max',
      'wind_speed_10m_max'
    ].join(','));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`天气获取失败：${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.reason || '天气获取失败。');
    forecast.value = data;
    lastUpdated.value = Date.now();
  } catch (error) {
    errorText.value = error?.message || '天气获取失败。';
  } finally {
    loading.value = false;
  }
}

defineExpose({
  current: () => ({
    location: locationTitle.value,
    current: current.value,
    summary: currentMeta.value.label,
    details: detailItems.value,
    updatedAt: lastUpdated.value
  }),
  refresh: async () => {
    await fetchForecast();
    return {
      location: locationTitle.value,
      current: current.value,
      summary: currentMeta.value.label,
      error: errorText.value
    };
  },
  searchCity: async (query = '', options = {}) => {
    searchQuery.value = String(query || '');
    await searchLocations();
    if (options.selectFirst !== false && searchResults.value[0]) {
      selectLocation(searchResults.value[0]);
      await fetchForecast();
    }
    return {
      query: searchQuery.value,
      results: searchResults.value,
      activeLocation: activeLocation.value,
      error: errorText.value
    };
  },
  setUnit: async (nextUnit = 'celsius') => {
    unit.value = nextUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    await fetchForecast();
    return { unit: unit.value, location: locationTitle.value, current: current.value };
  }
});
</script>

<template>
  <section class="weather-panel" :aria-busy="loading || locating">
    <header class="weather-toolbar">
      <form class="weather-search" @submit.prevent="searchLocations">
        <Search :size="16" />
        <input v-model="searchQuery" placeholder="搜索城市或邮编" />
        <button type="submit" :disabled="searchLoading">{{ searchLoading ? '搜索中' : '搜索' }}</button>
      </form>
      <button class="soft-btn" type="button" :disabled="locating" @click="useCurrentLocation()">
        <Loader2 v-if="locating" :size="15" class="spinning" />
        <LocateFixed v-else :size="15" />
        {{ locating ? '定位中' : '定位' }}
      </button>
      <button class="soft-btn" type="button" :disabled="loading" @click="fetchForecast"><RefreshCw :size="15" :class="{ spinning: loading }" /> {{ loading ? '更新中' : '刷新' }}</button>
      <div class="weather-unit-toggle" aria-label="温度单位">
        <button type="button" :class="{ active: unit === 'celsius' }" @click="unit = 'celsius'">°C</button>
        <button type="button" :class="{ active: unit === 'fahrenheit' }" @click="unit = 'fahrenheit'">°F</button>
      </div>
    </header>

    <div v-if="searchResults.length" class="weather-search-results">
      <button v-for="result in searchResults" :key="result.id" type="button" @click="selectLocation(result)">
        <MapPin :size="14" />
        <span>{{ formatLocation(result) }}</span>
      </button>
    </div>

    <p v-if="errorText" class="weather-error">{{ errorText }}</p>
    <p v-else-if="(loading || locating) && !forecast" class="weather-loading-state">
      <Loader2 :size="17" /> {{ locating ? '正在识别当前位置' : `正在获取 ${activeLocation.name} 的天气` }}
    </p>

    <main class="weather-layout">
      <aside class="weather-location-list">
        <button
          v-for="location in locations"
          :key="locationId(location)"
          type="button"
          :class="{ active: activeLocationId === locationId(location) }"
          @click="activeLocationId = locationId(location)"
        >
          <span>{{ location.name }}</span>
          <small>{{ location.isCurrent ? `当前位置${location.country ? ` · ${location.country}` : ''}` : location.country || '已保存城市' }}</small>
          <Trash2
            v-if="locations.length > 1"
            :size="14"
            @click.stop="removeLocation(locationId(location))"
          />
        </button>
      </aside>

      <section class="weather-content">
        <section class="weather-current-card">
          <div class="weather-current-copy">
            <span><MapPin :size="15" /> {{ locationTitle }}</span>
            <strong>{{ current ? `${round(current.temperature_2m)}${unitSymbol}` : '--' }}</strong>
            <p>
              <component :is="currentMeta.icon" :size="19" />
              {{ currentMeta.label }}
              <span v-if="current">体感 {{ round(current.apparent_temperature) }}{{ unitSymbol }}</span>
            </p>
            <small>{{ loading ? '正在更新' : updatedText }}</small>
          </div>
          <component :is="currentMeta.icon" class="weather-hero-icon" :size="112" />
        </section>

        <section class="weather-detail-grid">
          <article v-for="item in detailItems" :key="item.label">
            <small>{{ item.label }}</small>
            <strong>{{ item.value }}</strong>
          </article>
        </section>

        <section class="weather-section">
          <header><strong>24 小时</strong><Wind :size="15" /></header>
          <div class="weather-hourly-strip">
            <article v-for="hour in hourlyItems" :key="hour.time">
              <span>{{ hour.time }}</span>
              <component :is="weatherMeta(hour.code, hour.isDay).icon" :size="22" />
              <strong>{{ hour.temp }}{{ unitSymbol }}</strong>
              <small>{{ hour.pop }}%</small>
            </article>
          </div>
        </section>

        <section class="weather-section">
          <header><strong>7 日预报</strong><CloudSun :size="15" /></header>
          <div class="weather-daily-list">
            <article v-for="day in dailyItems" :key="day.date">
              <span>{{ day.date }}</span>
              <component :is="day.icon" :size="22" />
              <strong>{{ day.low }}° / {{ day.high }}°</strong>
              <small>降水 {{ day.pop }}% · 风 {{ day.wind }} km/h · UV {{ day.uv }}</small>
            </article>
          </div>
        </section>
      </section>
    </main>
  </section>
</template>
