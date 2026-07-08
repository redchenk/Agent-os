import { computed, reactive, watch } from 'vue';

const DEFAULT_ICON_POSITION = { x: 24, y: 24 };

function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeIcon(icon, fallback = DEFAULT_ICON_POSITION) {
  return {
    key: String(icon?.key || ''),
    x: Math.round(toFiniteNumber(icon?.x, fallback.x)),
    y: Math.round(toFiniteNumber(icon?.y, fallback.y))
  };
}

function defaultIconState(defaultDesktopIconState, validKeys) {
  return defaultDesktopIconState
    .map((icon) => normalizeIcon(icon))
    .filter((icon, index, icons) => (
      validKeys.has(icon.key)
      && icons.findIndex((item) => item.key === icon.key) === index
    ));
}

function readDesktopIconState(storageKey, defaultDesktopIconState, validKeys) {
  const fallback = defaultIconState(defaultDesktopIconState, validKeys);
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {};
    const savedIcons = Array.isArray(saved) ? saved : saved.icons;
    if (!Array.isArray(savedIcons)) return fallback;
    const seen = new Set();
    const normalized = savedIcons
      .map((icon) => normalizeIcon(icon))
      .filter((icon) => {
        if (!validKeys.has(icon.key) || seen.has(icon.key)) return false;
        seen.add(icon.key);
        return true;
      });
    return normalized.length ? normalized : fallback;
  } catch (_) {
    return fallback;
  }
}

export function useDesktopIcons({
  apps,
  defaultDesktopIconState,
  storageKey
}) {
  const appMap = computed(() => new Map(apps.map((app) => [app.key, app])));
  const validKeys = new Set(apps.map((app) => app.key));
  const desktopIcons = reactive(readDesktopIconState(storageKey, defaultDesktopIconState, validKeys));

  const desktopIconApps = computed(() => desktopIcons
    .map((icon) => {
      const app = appMap.value.get(icon.key);
      return app ? { ...app, x: icon.x, y: icon.y } : null;
    })
    .filter(Boolean));

  const desktopIconKeys = computed(() => desktopIcons.map((icon) => icon.key));

  function moveDesktopIcon(key, position) {
    const icon = desktopIcons.find((item) => item.key === key);
    if (!icon) return;
    icon.x = Math.round(toFiniteNumber(position?.x, icon.x));
    icon.y = Math.round(toFiniteNumber(position?.y, icon.y));
  }

  function addDesktopIcon(key, position = null) {
    if (!validKeys.has(key) || desktopIcons.some((icon) => icon.key === key)) return;
    const index = desktopIcons.length;
    const fallback = {
      x: DEFAULT_ICON_POSITION.x + (index % 4) * 104,
      y: DEFAULT_ICON_POSITION.y + Math.floor(index / 4) * 104
    };
    desktopIcons.push(normalizeIcon({ key, ...(position || fallback) }, fallback));
  }

  function removeDesktopIcon(key) {
    const index = desktopIcons.findIndex((icon) => icon.key === key);
    if (index >= 0) desktopIcons.splice(index, 1);
  }

  watch(desktopIcons, () => {
    localStorage.setItem(storageKey, JSON.stringify({
      icons: desktopIcons.map((icon) => ({ ...icon })),
      updatedAt: Date.now()
    }));
  }, { deep: true });

  return {
    addDesktopIcon,
    desktopIconApps,
    desktopIconKeys,
    desktopIcons,
    moveDesktopIcon,
    removeDesktopIcon
  };
}
