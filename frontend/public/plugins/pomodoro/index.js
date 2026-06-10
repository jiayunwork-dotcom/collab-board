(function() {
  'use strict';

  const TIMER_ELEMENT_ID_PREFIX = '__pomodoro_timer_';
  const BUTTON_ELEMENT_ID_PREFIX = '__pomodoro_btn_';

  const WORK_DURATION = 25 * 60;
  const SHORT_BREAK = 5 * 60;
  const LONG_BREAK = 15 * 60;

  let state = {
    mode: 'work',
    remaining: WORK_DURATION,
    running: false,
    cycles: 0,
    timerId: null,
    createdIds: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  async function clearTimerElements() {
    const ids = [...state.createdIds];
    state.createdIds = [];
    for (const id of ids) {
      try {
        await PluginAPI.canvas.updateElement(id, { visible: false, opacity: 0 });
      } catch (e) {}
    }
  }

  async function getTimerPosition() {
    try {
      const vp = await PluginAPI.canvas.getViewport();
      state.viewport = vp || state.viewport;
    } catch (e) {}
    const baseX = state.viewport.x + (window.innerWidth - 360) / state.viewport.zoom;
    const baseY = state.viewport.y + 30 / state.viewport.zoom;
    return { x: baseX, y: baseY };
  }

  async function renderTimer() {
    try {
      const { x, y } = await getTimerPosition();
      const timeStr = formatTime(state.remaining);
      const modeLabel = state.mode === 'work' ? '专注中 🍅' :
                       state.mode === 'short' ? '短休息 ☕' : '长休息 🌿';
      const bgColor = state.mode === 'work' ?
        (state.running ? '#FEE2E2' : '#F3F4F6') :
        (state.mode === 'short' ? '#FEF3C7' : '#DBEAFE');
      const borderColor = state.mode === 'work' ?
        (state.running ? '#EF4444' : '#9CA3AF') :
        (state.mode === 'short' ? '#F59E0B' : '#3B82F6');
      const textColor = state.mode === 'work' ?
        (state.running ? '#B91C1C' : '#374151') :
        (state.mode === 'short' ? '#92400E' : '#1D4ED8');

      const timerId = TIMER_ELEMENT_ID_PREFIX + 'main';
      const labelId = TIMER_ELEMENT_ID_PREFIX + 'label';
      const btnStartId = BUTTON_ELEMENT_ID_PREFIX + 'start';
      const btnResetId = BUTTON_ELEMENT_ID_PREFIX + 'reset';

      const newIds = [timerId, labelId, btnStartId, btnResetId];
      state.createdIds = newIds;

      try {
        await PluginAPI.canvas.createElement('rectangle', {
          id: labelId,
          x: x, y: y, width: 180, height: 26,
          data: {
            text: modeLabel + (state.cycles > 0 ? ' · 第' + state.cycles + '轮' : ''),
            fillColor: bgColor,
            strokeColor: borderColor,
            strokeWidth: 2,
            fontSize: 11,
            color: textColor,
            align: 'center',
            borderRadius: 6,
          },
          opacity: 0.95,
          locked: true,
          zIndex: 9999,
        });
      } catch (e) {}

      try {
        await PluginAPI.canvas.createElement('rectangle', {
          id: timerId,
          x: x, y: y + 28, width: 180, height: 48,
          data: {
            text: timeStr,
            fillColor: '#FFFFFF',
            strokeColor: borderColor,
            strokeWidth: 2,
            fontSize: state.running ? 28 : 26,
            bold: true,
            color: state.running ? '#DC2626' : '#1F2937',
            align: 'center',
            borderRadius: 8,
          },
          opacity: 0.95,
          locked: true,
          zIndex: 9999,
        });
      } catch (e) {}

      try {
        await PluginAPI.canvas.createElement('rectangle', {
          id: btnStartId,
          x: x, y: y + 80, width: 85, height: 28,
          data: {
            text: state.running ? '⏸ 暂停' : '▶ 开始',
            fillColor: state.running ? '#FEF3C7' : '#DCFCE7',
            strokeColor: state.running ? '#F59E0B' : '#10B981',
            strokeWidth: 1.5,
            fontSize: 11,
            color: state.running ? '#92400E' : '#047857',
            align: 'center',
            borderRadius: 6,
          },
          opacity: 0.95,
          locked: true,
          zIndex: 9999,
        });
      } catch (e) {}

      try {
        await PluginAPI.canvas.createElement('rectangle', {
          id: btnResetId,
          x: x + 95, y: y + 80, width: 85, height: 28,
          data: {
            text: '↻ 重置',
            fillColor: '#F3F4F6',
            strokeColor: '#9CA3AF',
            strokeWidth: 1.5,
            fontSize: 11,
            color: '#374151',
            align: 'center',
            borderRadius: 6,
          },
          opacity: 0.95,
          locked: true,
          zIndex: 9999,
        });
      } catch (e) {}

    } catch (e) {
      console.error('[pomodoro] render error:', e);
    }
  }

  function tick() {
    if (!state.running) return;

    state.remaining--;
    try {
      PluginAPI.storage.set('timer_state', {
        remaining: state.remaining,
        mode: state.mode,
        cycles: state.cycles,
        running: state.running,
        lastTick: Date.now(),
      });
    } catch (e) {}

    if (state.remaining <= 0) {
      completePhase();
    } else {
      renderTimer();
    }
  }

  async function completePhase() {
    stopTicker();

    if (state.mode === 'work') {
      state.cycles++;
      try {
        await PluginAPI.notification.show(
          '🍅 番茄钟完成！',
          '太棒了！完成了第 ' + state.cycles + ' 个番茄。来休息一下吧 ☕'
        );
      } catch (e) {}

      if (state.cycles % 4 === 0) {
        state.mode = 'long';
        state.remaining = LONG_BREAK;
      } else {
        state.mode = 'short';
        state.remaining = SHORT_BREAK;
      }
    } else {
      try {
        await PluginAPI.notification.show(
          '☕ 休息结束！',
          '休息好了吗？继续专注下一个番茄吧 💪'
        );
      } catch (e) {}
      state.mode = 'work';
      state.remaining = WORK_DURATION;
    }

    state.running = false;
    try {
      PluginAPI.storage.set('timer_state', {
        remaining: state.remaining,
        mode: state.mode,
        cycles: state.cycles,
        running: false,
      });
    } catch (e) {}
    renderTimer();
  }

  function startTicker() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = setInterval(tick, 1000);
  }

  function stopTicker() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  async function restoreState() {
    try {
      const saved = await PluginAPI.storage.get('timer_state');
      if (saved && typeof saved === 'object') {
        if (saved.mode) state.mode = saved.mode;
        if (typeof saved.remaining === 'number') state.remaining = saved.remaining;
        if (typeof saved.cycles === 'number') state.cycles = saved.cycles;
        if (saved.running && saved.lastTick) {
          const elapsed = Math.floor((Date.now() - saved.lastTick) / 1000);
          if (elapsed > 0) {
            state.remaining = Math.max(0, state.remaining - elapsed);
            if (state.remaining <= 0) {
              state.running = false;
              completePhase();
              return;
            }
          }
          state.running = true;
          startTicker();
        }
      }
    } catch (e) {}
  }

  PluginAPI.on('viewport:changed', function() {
    renderTimer();
  });

  PluginAPI.on('element:updated', function(el) {
    if (!el || !el.id) return;
    if (el.id === BUTTON_ELEMENT_ID_PREFIX + 'start' && state.createdIds.length > 0) {
      if (!state.running) {
        state.running = true;
        startTicker();
        renderTimer();
      } else {
        state.running = false;
        stopTicker();
        try {
          PluginAPI.storage.set('timer_state', {
            remaining: state.remaining,
            mode: state.mode,
            cycles: state.cycles,
            running: false,
          });
        } catch (e) {}
        renderTimer();
      }
    }
    if (el.id === BUTTON_ELEMENT_ID_PREFIX + 'reset' && state.createdIds.length > 0) {
      stopTicker();
      state.mode = 'work';
      state.remaining = WORK_DURATION;
      state.running = false;
      state.cycles = 0;
      try {
        PluginAPI.storage.set('timer_state', null);
      } catch (e) {}
      renderTimer();
    }
  });

  async function init() {
    await restoreState();
    await clearTimerElements();
    await renderTimer();
    console.log('[pomodoro] Plugin loaded! 🍅 25-minute timer ready. Click ▶ Start to begin focus session.');
  }

  init();
})();
