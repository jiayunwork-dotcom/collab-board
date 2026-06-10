(function() {
  'use strict';

  const RULER_PREFIX = '__ruler_line_';
  const DISTANCE_LABEL_PREFIX = '__ruler_label_';
  let lastSelectionId = null;
  let createdElements = [];
  let lastSelectedIds = [];

  function isOurElement(el) {
    const text = el.data && el.data.text;
    const id = el.id;
    if (id && (id.startsWith(RULER_PREFIX) || id.startsWith(DISTANCE_LABEL_PREFIX))) {
      return true;
    }
    if (text && (text.startsWith('↔ ') || text.startsWith('↕ '))) {
      return true;
    }
    return false;
  }

  async function clearRulers() {
    if (createdElements.length === 0) return;
    const elements = await PluginAPI.canvas.getElements();
    const ourIds = new Set(createdElements);
    for (const el of elements) {
      if (isOurElement(el) || ourIds.has(el.id)) {
        try {
          await PluginAPI.canvas.updateElement(el.id, { visible: false, opacity: 0 });
        } catch(e) {}
      }
    }
    createdElements = [];
  }

  function getCenter(el) {
    return {
      cx: el.x + el.width / 2,
      cy: el.y + el.height / 2,
      left: el.x,
      right: el.x + el.width,
      top: el.y,
      bottom: el.y + el.height,
    };
  }

  async function drawHorizontalDistance(el1, el2, elementsMap) {
    const a = getCenter(el1);
    const b = getCenter(el2);

    const avgY = (a.cy + b.cy) / 2;
    const leftEdge = Math.min(a.right, b.right);
    const rightEdge = Math.max(a.left, b.left);

    if (rightEdge < leftEdge) return;

    const distX = Math.abs(rightEdge - leftEdge);
    const lineId = RULER_PREFIX + 'h_' + Math.random().toString(36).slice(2, 9);
    const labelId = DISTANCE_LABEL_PREFIX + 'h_' + Math.random().toString(36).slice(2, 9);

    try {
      await PluginAPI.canvas.createElement('line', {
        id: lineId,
        x: leftEdge,
        y: avgY,
        width: Math.max(1, distX),
        height: 1,
        data: {
          strokeColor: '#EF4444',
          strokeWidth: 1,
          points: [{ x: 0, y: 0.5 }, { x: distX, y: 0.5 }],
          arrowStart: true,
          arrowEnd: true,
        },
        opacity: 0.8,
        locked: true,
      });
      createdElements.push(lineId);

      const labelText = '↔ ' + Math.round(distX) + 'px';
      await PluginAPI.canvas.createElement('text', {
        id: labelId,
        x: leftEdge + distX / 2 - 30,
        y: avgY - 22,
        width: 60,
        height: 18,
        data: {
          text: labelText,
          fontSize: 11,
          color: '#EF4444',
          align: 'center',
          fillColor: '#FEF2F2',
        },
        opacity: 0.9,
        locked: true,
      });
      createdElements.push(labelId);
    } catch (e) {
      console.error('auto-ruler draw horizontal error:', e);
    }
  }

  async function drawVerticalDistance(el1, el2) {
    const a = getCenter(el1);
    const b = getCenter(el2);

    const avgX = (a.cx + b.cx) / 2;
    const topEdge = Math.min(a.bottom, b.bottom);
    const bottomEdge = Math.max(a.top, b.top);

    if (bottomEdge < topEdge) return;

    const distY = Math.abs(bottomEdge - topEdge);
    const lineId = RULER_PREFIX + 'v_' + Math.random().toString(36).slice(2, 9);
    const labelId = DISTANCE_LABEL_PREFIX + 'v_' + Math.random().toString(36).slice(2, 9);

    try {
      await PluginAPI.canvas.createElement('line', {
        id: lineId,
        x: avgX,
        y: topEdge,
        width: 1,
        height: Math.max(1, distY),
        data: {
          strokeColor: '#3B82F6',
          strokeWidth: 1,
          points: [{ x: 0.5, y: 0 }, { x: 0.5, y: distY }],
          arrowStart: true,
          arrowEnd: true,
        },
        opacity: 0.8,
        locked: true,
      });
      createdElements.push(lineId);

      const labelText = '↕ ' + Math.round(distY) + 'px';
      await PluginAPI.canvas.createElement('text', {
        id: labelId,
        x: avgX + 6,
        y: topEdge + distY / 2 - 9,
        width: 60,
        height: 18,
        data: {
          text: labelText,
          fontSize: 11,
          color: '#3B82F6',
          align: 'left',
          fillColor: '#EFF6FF',
        },
        opacity: 0.9,
        locked: true,
      });
      createdElements.push(labelId);
    } catch (e) {
      console.error('auto-ruler draw vertical error:', e);
    }
  }

  async function updateRulers() {
    try {
      const allElements = await PluginAPI.canvas.getElements();
      const userElements = allElements.filter(el => !isOurElement(el) && el.visible !== false);
      const elementsMap = new Map(userElements.map(e => [e.id, e]));

      let selected = userElements.filter(e => lastSelectedIds.includes(e.id));

      if (selected.length < 2) {
        await clearRulers();
        return;
      }

      const selKey = selected.map(e => e.id).sort().join('|');
      if (selKey === lastSelectionId && createdElements.length > 0) {
        return;
      }
      lastSelectionId = selKey;

      await clearRulers();
      await new Promise(r => setTimeout(r, 30));

      const first = selected[0];
      for (let i = 1; i < selected.length; i++) {
        await drawHorizontalDistance(first, selected[i], elementsMap);
        await drawVerticalDistance(first, selected[i]);
      }
      if (selected.length > 2) {
        for (let i = 1; i < selected.length; i++) {
          for (let j = i + 1; j < selected.length; j++) {
            await drawHorizontalDistance(selected[i], selected[j], elementsMap);
            await drawVerticalDistance(selected[i], selected[j]);
          }
        }
      }
    } catch (e) {
      console.error('auto-ruler update error:', e);
    }
  }

  PluginAPI.on('selection:changed', function(ids) {
    lastSelectedIds = Array.isArray(ids) ? ids : [];
    lastSelectionId = null;
    updateRulers();
  });

  PluginAPI.on('element:updated', function() {
    if (lastSelectedIds.length >= 2) {
      lastSelectionId = null;
      updateRulers();
    }
  });

  PluginAPI.on('element:created', function() {
    if (lastSelectedIds.length >= 2) {
      lastSelectionId = null;
      updateRulers();
    }
  });

  console.log('[auto-ruler] Plugin loaded. Select 2+ elements to see distance rulers.');
})();
