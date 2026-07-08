<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  AlarmClock,
  Bell,
  Globe2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Timer,
  Trash2
} from 'lucide-vue-next';

const CLOCK_ALARMS_STORAGE_KEY = 'hermesAgentOsClockAlarms:v1';
const CLOCK_ZONES_STORAGE_KEY = 'hermesAgentOsClockZones:v1';

const tabs = [
  { key: 'world', label: '世界时钟', icon: Globe2 },
  { key: 'timer', label: '计时器', icon: Timer },
  { key: 'stopwatch', label: '秒表', icon: Play },
  { key: 'alarm', label: '闹钟', icon: AlarmClock }
];

const availableZones = [
  { id: 'Asia/Shanghai', label: '上海' },
  { id: 'Asia/Tokyo', label: '东京' },
  { id: 'Asia/Seoul', label: '首尔' },
  { id: 'Europe/London', label: '伦敦' },
  { id: 'Europe/Paris', label: '巴黎' },
  { id: 'America/New_York', label: '纽约' },
  { id: 'America/Los_Angeles', label: '洛杉矶' },
  { id: 'Australia/Sydney', label: '悉尼' }
];

const now = ref(Date.now());
const activeTab = ref('world');
const worldZones = ref(readStoredArray(CLOCK_ZONES_STORAGE_KEY, ['Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York']));
const selectedZone = ref(availableZones.find((zone) => !worldZones.value.includes(zone.id))?.id || '');
const alarms = ref(readStoredArray(CLOCK_ALARMS_STORAGE_KEY, []));
const alarmTime = ref('08:30');
const alarmLabel = ref('提醒');
const ringingAlarm = ref(null);

const timerHours = ref(0);
const timerMinutes = ref(5);
const timerSeconds = ref(0);
const timerRemaining = ref(5 * 60);
const timerEndAt = ref(0);
const timerRunning = ref(false);
const timerFinished = ref(false);

const stopwatchElapsed = ref(0);
const stopwatchStartedAt = ref(0);
const stopwatchRunning = ref(false);
const stopwatchLaps = ref([]);

let tickTimer = 0;

const currentDate = computed(() => new Date(now.value));
const currentTimeText = computed(() => new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
}).format(currentDate.value));
const currentDateText = computed(() => new Intl.DateTimeFormat('zh-CN', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric'
}).format(currentDate.value));
const analogStyle = computed(() => {
  const date = currentDate.value;
  const seconds = date.getSeconds();
  const minutes = date.getMinutes();
  const hours = date.getHours() % 12;
  return {
    '--clock-second': `${seconds * 6}deg`,
    '--clock-minute': `${(minutes + seconds / 60) * 6}deg`,
    '--clock-hour': `${(hours + minutes / 60) * 30}deg`
  };
});

const selectedZoneOptions = computed(() => availableZones.filter((zone) => !worldZones.value.includes(zone.id)));
const activeZoneCards = computed(() => worldZones.value.map((zoneId) => {
  const zone = availableZones.find((item) => item.id === zoneId) || { id: zoneId, label: zoneId };
  return {
    ...zone,
    time: formatZoneTime(zoneId),
    date: formatZoneDate(zoneId)
  };
}));
const timerTotalInput = computed(() => (
  Math.max(0, Number(timerHours.value) || 0) * 3600
  + Math.max(0, Number(timerMinutes.value) || 0) * 60
  + Math.max(0, Number(timerSeconds.value) || 0)
));
const timerProgress = computed(() => {
  const total = Math.max(1, timerTotalInput.value || timerRemaining.value || 1);
  return `${Math.max(0, Math.min(1, timerRemaining.value / total)) * 100}%`;
});
const timerText = computed(() => formatDuration(timerRemaining.value * 1000));
const stopwatchText = computed(() => formatDuration(stopwatchElapsed.value));

watch(worldZones, () => {
  localStorage.setItem(CLOCK_ZONES_STORAGE_KEY, JSON.stringify(worldZones.value));
}, { deep: true });

watch(alarms, () => {
  localStorage.setItem(CLOCK_ALARMS_STORAGE_KEY, JSON.stringify(alarms.value));
}, { deep: true });

watch([timerHours, timerMinutes, timerSeconds], () => {
  if (!timerRunning.value) timerRemaining.value = timerTotalInput.value;
});

onMounted(() => {
  tickTimer = window.setInterval(tick, 250);
  tick();
});

onBeforeUnmount(() => {
  window.clearInterval(tickTimer);
});

function readStoredArray(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(value) ? value : fallback;
  } catch (_) {
    return fallback;
  }
}

function id() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function tick() {
  now.value = Date.now();
  updateTimer();
  updateStopwatch();
  checkAlarms();
}

function formatZoneTime(timeZone) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(now.value);
}

function formatZoneDate(timeZone) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    weekday: 'short',
    month: '2-digit',
    day: '2-digit'
  }).format(now.value);
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((Math.max(0, milliseconds) % 1000) / 10);
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}.${pad(centiseconds)}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function addZone() {
  if (!selectedZone.value || worldZones.value.includes(selectedZone.value)) return;
  worldZones.value = [...worldZones.value, selectedZone.value];
  selectedZone.value = selectedZoneOptions.value[0]?.id || '';
}

function removeZone(zoneId) {
  worldZones.value = worldZones.value.filter((item) => item !== zoneId);
  if (!selectedZone.value) selectedZone.value = selectedZoneOptions.value[0]?.id || '';
}

function startTimer() {
  if (!timerRemaining.value) timerRemaining.value = timerTotalInput.value;
  if (!timerRemaining.value) return;
  timerFinished.value = false;
  timerRunning.value = true;
  timerEndAt.value = Date.now() + timerRemaining.value * 1000;
}

function pauseTimer() {
  updateTimer();
  timerRunning.value = false;
}

function resetTimer() {
  timerRunning.value = false;
  timerFinished.value = false;
  timerRemaining.value = timerTotalInput.value;
}

function updateTimer() {
  if (!timerRunning.value) return;
  const remaining = Math.max(0, Math.ceil((timerEndAt.value - Date.now()) / 1000));
  timerRemaining.value = remaining;
  if (remaining <= 0) {
    timerRunning.value = false;
    timerFinished.value = true;
    playChime();
  }
}

function startStopwatch() {
  if (stopwatchRunning.value) return;
  stopwatchStartedAt.value = Date.now() - stopwatchElapsed.value;
  stopwatchRunning.value = true;
}

function pauseStopwatch() {
  updateStopwatch();
  stopwatchRunning.value = false;
}

function resetStopwatch() {
  stopwatchRunning.value = false;
  stopwatchElapsed.value = 0;
  stopwatchStartedAt.value = 0;
  stopwatchLaps.value = [];
}

function lapStopwatch() {
  updateStopwatch();
  if (!stopwatchElapsed.value) return;
  stopwatchLaps.value = [
    { id: id(), index: stopwatchLaps.value.length + 1, value: stopwatchElapsed.value },
    ...stopwatchLaps.value
  ];
}

function updateStopwatch() {
  if (!stopwatchRunning.value) return;
  stopwatchElapsed.value = Date.now() - stopwatchStartedAt.value;
}

function addAlarm() {
  if (!alarmTime.value) return;
  alarms.value = [
    ...alarms.value,
    {
      id: id(),
      time: alarmTime.value,
      label: alarmLabel.value.trim() || '提醒',
      enabled: true,
      lastTriggered: ''
    }
  ].sort((a, b) => a.time.localeCompare(b.time));
  alarmLabel.value = '提醒';
}

function toggleAlarm(alarm) {
  alarm.enabled = !alarm.enabled;
}

function deleteAlarm(alarmId) {
  alarms.value = alarms.value.filter((alarm) => alarm.id !== alarmId);
  if (ringingAlarm.value?.id === alarmId) ringingAlarm.value = null;
}

function checkAlarms() {
  const date = new Date(now.value);
  const current = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const today = date.toDateString();
  const alarm = alarms.value.find((item) => item.enabled && item.time === current && item.lastTriggered !== today);
  if (!alarm) return;
  alarm.lastTriggered = today;
  ringingAlarm.value = alarm;
  playChime();
}

function dismissAlarm() {
  ringingAlarm.value = null;
}

function playChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.45);
    window.setTimeout(() => context.close(), 520);
  } catch (_) {
    // Audio feedback is optional; visual state still shows the alert.
  }
}
</script>

<template>
  <section class="clock-panel">
    <header class="clock-hero">
      <div class="clock-hero-copy">
        <span><AlarmClock :size="16" /> 本地时间</span>
        <strong>{{ currentTimeText }}</strong>
        <small>{{ currentDateText }}</small>
      </div>
      <div class="clock-face" :style="analogStyle" aria-hidden="true">
        <i class="hour"></i>
        <i class="minute"></i>
        <i class="second"></i>
        <b></b>
      </div>
    </header>

    <nav class="clock-tabs" aria-label="时钟功能">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <component :is="tab.icon" :size="15" />
        {{ tab.label }}
      </button>
    </nav>

    <main class="clock-body">
      <section v-if="activeTab === 'world'" class="clock-view">
        <div class="clock-add-row">
          <select v-model="selectedZone" :disabled="!selectedZoneOptions.length">
            <option v-for="zone in selectedZoneOptions" :key="zone.id" :value="zone.id">{{ zone.label }}</option>
          </select>
          <button type="button" class="soft-btn" :disabled="!selectedZoneOptions.length" @click="addZone">
            <Plus :size="15" /> 添加
          </button>
        </div>
        <div class="clock-world-grid">
          <article v-for="zone in activeZoneCards" :key="zone.id" class="clock-card">
            <div>
              <strong>{{ zone.label }}</strong>
              <small>{{ zone.date }}</small>
            </div>
            <span>{{ zone.time }}</span>
            <button type="button" title="移除" @click="removeZone(zone.id)"><Trash2 :size="14" /></button>
          </article>
        </div>
      </section>

      <section v-else-if="activeTab === 'timer'" class="clock-view timer-view">
        <div class="clock-timer-ring" :style="{ '--timer-progress': timerProgress }">
          <strong>{{ timerText }}</strong>
          <small>{{ timerFinished ? '时间到' : timerRunning ? '计时中' : '已就绪' }}</small>
        </div>
        <div class="clock-duration-inputs">
          <label><span>小时</span><input v-model.number="timerHours" type="number" min="0" max="23" /></label>
          <label><span>分钟</span><input v-model.number="timerMinutes" type="number" min="0" max="59" /></label>
          <label><span>秒</span><input v-model.number="timerSeconds" type="number" min="0" max="59" /></label>
        </div>
        <div class="clock-actions">
          <button v-if="!timerRunning" type="button" class="accent-btn" @click="startTimer"><Play :size="15" /> 开始</button>
          <button v-else type="button" class="soft-btn" @click="pauseTimer"><Pause :size="15" /> 暂停</button>
          <button type="button" class="soft-btn" @click="resetTimer"><RotateCcw :size="15" /> 重置</button>
        </div>
      </section>

      <section v-else-if="activeTab === 'stopwatch'" class="clock-view stopwatch-view">
        <div class="clock-stopwatch-display">
          <strong>{{ stopwatchText }}</strong>
          <small>{{ stopwatchRunning ? '运行中' : '已暂停' }}</small>
        </div>
        <div class="clock-actions">
          <button v-if="!stopwatchRunning" type="button" class="accent-btn" @click="startStopwatch"><Play :size="15" /> 开始</button>
          <button v-else type="button" class="soft-btn" @click="pauseStopwatch"><Pause :size="15" /> 暂停</button>
          <button type="button" class="soft-btn" @click="lapStopwatch">计圈</button>
          <button type="button" class="soft-btn" @click="resetStopwatch"><RotateCcw :size="15" /> 重置</button>
        </div>
        <div class="clock-lap-list">
          <article v-for="lap in stopwatchLaps" :key="lap.id">
            <span>第 {{ lap.index }} 圈</span>
            <strong>{{ formatDuration(lap.value) }}</strong>
          </article>
          <p v-if="!stopwatchLaps.length">暂无计圈</p>
        </div>
      </section>

      <section v-else class="clock-view alarm-view">
        <div v-if="ringingAlarm" class="clock-alarm-banner">
          <Bell :size="18" />
          <span>{{ ringingAlarm.time }} · {{ ringingAlarm.label }}</span>
          <button type="button" @click="dismissAlarm">关闭</button>
        </div>
        <div class="clock-add-row">
          <input v-model="alarmTime" type="time" />
          <input v-model="alarmLabel" type="text" maxlength="18" placeholder="标签" />
          <button type="button" class="soft-btn" @click="addAlarm"><Plus :size="15" /> 添加</button>
        </div>
        <div class="clock-alarm-list">
          <article v-for="alarm in alarms" :key="alarm.id" :class="{ muted: !alarm.enabled }">
            <button type="button" class="clock-switch" :class="{ active: alarm.enabled }" @click="toggleAlarm(alarm)"></button>
            <div>
              <strong>{{ alarm.time }}</strong>
              <small>{{ alarm.label }}</small>
            </div>
            <button type="button" title="删除" @click="deleteAlarm(alarm.id)"><Trash2 :size="15" /></button>
          </article>
          <p v-if="!alarms.length">暂无闹钟</p>
        </div>
      </section>
    </main>
  </section>
</template>
