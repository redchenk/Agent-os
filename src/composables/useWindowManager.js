import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

function readWindowState(storageKey, defaultWindowState) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {};
    return Object.fromEntries(Object.entries(defaultWindowState).map(([key, value]) => [key, { ...value, ...(saved[key] || {}) }]));
  } catch (_) {
    return defaultWindowState;
  }
}

export function useWindowManager({
  apps,
  defaultWindowState,
  storageKey,
  initialOpenApps = {},
  initialActiveApp = '',
  overlays = []
}) {
  const windowState = reactive(readWindowState(storageKey, defaultWindowState));
  const openApps = reactive({ ...initialOpenApps });
  const activeApp = ref(initialActiveApp);
  const resizeDirections = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];
  let windowPointerState = null;

  function closeOverlays() {
    overlays.forEach((item) => {
      if (item) item.value = false;
    });
  }

  function focusApp(key) {
    openApps[key] = true;
    activeApp.value = key;
    closeOverlays();
  }

  function closeApp(key) {
    openApps[key] = false;
    if (activeApp.value === key) {
      activeApp.value = apps.find((app) => openApps[app.key])?.key || '';
    }
  }

  function isCompactLayout() {
    return typeof window !== 'undefined' && window.innerWidth <= 1080;
  }

  function windowStyle(key) {
    const state = windowState[key];
    if (!state || isCompactLayout()) return { zIndex: activeApp.value === key ? 18 : 10 };
    return {
      zIndex: activeApp.value === key ? 18 : 10,
      left: `${state.x}px`,
      top: `${state.y}px`,
      width: `${state.w}px`,
      height: `${state.h}px`
    };
  }

  function viewportBounds(state = {}) {
    const width = Math.max(window.innerWidth || 0, 360);
    const height = Math.max(window.innerHeight || 0, 520);
    const dockSafeArea = 112;
    const maxW = Math.max(width - 24, 320);
    const maxH = Math.max(height - dockSafeArea - 16, 260);
    const windowW = Math.min(Math.max(state.w || 320, state.minW || 320), maxW);
    const windowH = Math.min(Math.max(state.h || 240, state.minH || 240), maxH);
    return {
      minX: 12,
      minY: 12,
      maxX: Math.max(12, width - windowW - 12),
      maxY: Math.max(12, height - windowH - dockSafeArea),
      maxW,
      maxH
    };
  }

  function clampWindow(key) {
    const state = windowState[key];
    if (!state) return;
    const bounds = viewportBounds(state);
    state.w = Math.min(Math.max(state.w, state.minW || 320), bounds.maxW);
    state.h = Math.min(Math.max(state.h, state.minH || 240), bounds.maxH);
    state.x = Math.min(Math.max(state.x, bounds.minX), Math.max(bounds.minX, bounds.maxX));
    state.y = Math.min(Math.max(state.y, bounds.minY), Math.max(bounds.minY, bounds.maxY));
  }

  function clampAllWindows() {
    Object.keys(windowState).forEach(clampWindow);
  }

  function startWindowDrag(event, key) {
    if (isCompactLayout()) return;
    focusApp(key);
    const state = windowState[key];
    windowPointerState = {
      type: 'drag',
      key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: state.x,
      y: state.y
    };
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function startWindowResize(event, key, direction) {
    if (isCompactLayout()) return;
    focusApp(key);
    const state = windowState[key];
    windowPointerState = {
      type: 'resize',
      key,
      direction,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: state.x,
      y: state.y,
      w: state.w,
      h: state.h
    };
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function moveWindowPointer(event) {
    if (!windowPointerState) return;
    const state = windowState[windowPointerState.key];
    if (!state) return;
    const dx = event.clientX - windowPointerState.startX;
    const dy = event.clientY - windowPointerState.startY;

    if (windowPointerState.type === 'drag') {
      state.x = windowPointerState.x + dx;
      state.y = windowPointerState.y + dy;
      clampWindow(windowPointerState.key);
      return;
    }

    if (windowPointerState.type === 'resize') {
      const direction = windowPointerState.direction;
      let nextX = windowPointerState.x;
      let nextY = windowPointerState.y;
      let nextW = windowPointerState.w;
      let nextH = windowPointerState.h;

      if (direction.includes('e')) nextW = windowPointerState.w + dx;
      if (direction.includes('s')) nextH = windowPointerState.h + dy;
      if (direction.includes('w')) {
        nextW = windowPointerState.w - dx;
        nextX = windowPointerState.x + dx;
      }
      if (direction.includes('n')) {
        nextH = windowPointerState.h - dy;
        nextY = windowPointerState.y + dy;
      }

      const minW = state.minW || 320;
      const minH = state.minH || 240;
      if (nextW < minW) {
        if (direction.includes('w')) nextX -= minW - nextW;
        nextW = minW;
      }
      if (nextH < minH) {
        if (direction.includes('n')) nextY -= minH - nextH;
        nextH = minH;
      }
      state.x = nextX;
      state.y = nextY;
      state.w = nextW;
      state.h = nextH;
      clampWindow(windowPointerState.key);
    }
  }

  function endWindowPointer(event) {
    if (windowPointerState?.pointerId === event.pointerId) windowPointerState = null;
  }

  function maximizeWindow(key) {
    if (isCompactLayout()) return;
    const state = windowState[key];
    if (!state) return;
    const bounds = viewportBounds(state);
    state.x = bounds.minX;
    state.y = bounds.minY;
    state.w = bounds.maxW;
    state.h = bounds.maxH;
    focusApp(key);
  }

  function resetWindow(key) {
    if (!defaultWindowState[key]) return;
    Object.assign(windowState[key], defaultWindowState[key]);
    focusApp(key);
  }

  watch(windowState, () => {
    localStorage.setItem(storageKey, JSON.stringify(windowState));
  }, { deep: true });

  onMounted(() => {
    clampAllWindows();
    window.addEventListener('pointermove', moveWindowPointer);
    window.addEventListener('pointerup', endWindowPointer);
    window.addEventListener('pointercancel', endWindowPointer);
    window.addEventListener('resize', clampAllWindows);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', moveWindowPointer);
    window.removeEventListener('pointerup', endWindowPointer);
    window.removeEventListener('pointercancel', endWindowPointer);
    window.removeEventListener('resize', clampAllWindows);
  });

  return {
    activeApp,
    closeApp,
    focusApp,
    maximizeWindow,
    openApps,
    resetWindow,
    resizeDirections,
    startWindowDrag,
    startWindowResize,
    windowState,
    windowStyle
  };
}
