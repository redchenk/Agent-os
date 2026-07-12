import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

function readLive2DModelState(storageKey, defaultModel) {
  try {
    return { ...defaultModel, ...(JSON.parse(localStorage.getItem(storageKey) || '{}') || {}) };
  } catch (_) {
    return { ...defaultModel };
  }
}

export function useLive2DWindow({ defaultModel, enabled, getStageElement, live2d, openApps, storageKey }) {
  const live2dModel = reactive(readLive2DModelState(storageKey, defaultModel));
  const live2dDragging = ref(false);
  let pointerState = null;
  let stageResizeObserver = null;
  let initSerial = 0;

  function canBootLive2D() {
    return openApps.yachiyo && enabled?.value !== false;
  }

  function applyLive2DModel() {
    if (typeof window === 'undefined' || typeof window.setLive2DModelSettings !== 'function') return;
    window.requestAnimationFrame(() => {
      window.setLive2DModelSettings(live2dModel.scale, live2dModel.x, live2dModel.y);
    });
  }

  function resetLive2DModel() {
    Object.assign(live2dModel, { ...defaultModel });
    applyLive2DModel();
  }

  function startLive2DModelDrag(event) {
    if (event.button !== 0) return;
    pointerState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: live2dModel.x, y: live2dModel.y }
    };
    live2dDragging.value = true;
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function moveLive2DModelPointer(event) {
    if (!pointerState || event.pointerId !== pointerState.pointerId) return;
    const dx = event.clientX - pointerState.startX;
    const dy = event.clientY - pointerState.startY;
    live2dModel.x = pointerState.origin.x + dx * 2;
    live2dModel.y = pointerState.origin.y + dy * 2;
    event.preventDefault();
  }

  function endLive2DModelPointer(event) {
    if (!pointerState || event.pointerId !== pointerState.pointerId) return;
    pointerState = null;
    live2dDragging.value = false;
  }

  function zoomLive2DModel(event) {
    const factor = Math.exp(-Number(event.deltaY || 0) * 0.0012);
    live2dModel.scale = Math.min(Math.max(live2dModel.scale * factor, 0.42), 1.8);
  }

  function fitLive2DModel() {
    applyLive2DModel();
  }

  function reloadLive2DFrame() {
    live2d.init().then(() => {
      window.setTimeout(fitLive2DModel, 350);
    });
  }

  function observeLive2DStage() {
    const stageElement = getStageElement();
    if (typeof ResizeObserver === 'undefined' || !stageElement) return;
    stageResizeObserver?.disconnect();
    stageResizeObserver = new ResizeObserver(() => {
      applyLive2DModel();
    });
    stageResizeObserver.observe(stageElement);
  }

  async function bootLive2DWindow() {
    if (!canBootLive2D()) return;
    const serial = ++initSerial;
    await nextTick();
    observeLive2DStage();
    await live2d.init();
    if (serial !== initSerial || !canBootLive2D()) return;
    window.setTimeout(fitLive2DModel, 350);
  }

  function shutdownLive2DWindow() {
    initSerial += 1;
    stageResizeObserver?.disconnect();
    stageResizeObserver = null;
    live2d.destroy();
  }

  watch(live2dModel, () => {
    localStorage.setItem(storageKey, JSON.stringify(live2dModel));
    applyLive2DModel();
  }, { deep: true });

  watch([() => openApps.yachiyo, () => enabled?.value ?? true], ([open, isEnabled]) => {
    if (open && isEnabled) {
      bootLive2DWindow();
    } else {
      shutdownLive2DWindow();
    }
  }, { flush: 'post' });

  onMounted(() => {
    window.addEventListener('pointermove', moveLive2DModelPointer);
    window.addEventListener('pointerup', endLive2DModelPointer);
    window.addEventListener('pointercancel', endLive2DModelPointer);
    if (canBootLive2D()) bootLive2DWindow();
  });

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', moveLive2DModelPointer);
    window.removeEventListener('pointerup', endLive2DModelPointer);
    window.removeEventListener('pointercancel', endLive2DModelPointer);
    stageResizeObserver?.disconnect();
    live2d.destroy();
  });

  return {
    live2dDragging,
    live2dModel,
    reloadLive2DFrame,
    resetLive2DModel,
    startLive2DModelDrag,
    zoomLive2DModel
  };
}
