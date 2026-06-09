import { useCallback, useRef, useEffect, useState } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasElement, CanvasConnection, ElementType, Tool, Viewport } from '@/types';
import { uid, pointInRect, getElementBBox, rotatePoint, rectsIntersect, throttle, deepClone } from '@/utils';
import { screenToWorld, worldToScreen } from '@/canvas/geometry';
import { collabClient } from '@/collaboration/CollabClient';
import { elementApi } from '@/api/client';

type ResizeHandle =
  | 'topLeft' | 'top' | 'topRight'
  | 'right' | 'bottomRight' | 'bottom' | 'bottomLeft' | 'left';

export const RESIZE_HANDLES: ResizeHandle[] = [
  'topLeft', 'top', 'topRight',
  'right', 'bottomRight', 'bottom',
  'bottomLeft', 'left',
];

export function getResizeHandlePosition(
  el: CanvasElement,
  handle: ResizeHandle
): { x: number; y: number } {
  switch (handle) {
    case 'topLeft': return { x: el.x, y: el.y };
    case 'top': return { x: el.x + el.width / 2, y: el.y };
    case 'topRight': return { x: el.x + el.width, y: el.y };
    case 'right': return { x: el.x + el.width, y: el.y + el.height / 2 };
    case 'bottomRight': return { x: el.x + el.width, y: el.y + el.height };
    case 'bottom': return { x: el.x + el.width / 2, y: el.y + el.height };
    case 'bottomLeft': return { x: el.x, y: el.y + el.height };
    case 'left': return { x: el.x, y: el.y + el.height / 2 };
  }
}

export function hitTestResizeHandle(
  worldX: number, worldY: number,
  el: CanvasElement, zoom: number
): ResizeHandle | null {
  const handleSize = 8 / zoom;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rotation = el.rotation || 0;

  for (const h of RESIZE_HANDLES) {
    const pos = getResizeHandlePosition(el, h);
    const hit = rotation
      ? rotatePoint(worldX, worldY, cx, cy, -rotation)
      : { x: worldX, y: worldY };
    if (
      hit.x >= pos.x - handleSize && hit.x <= pos.x + handleSize &&
      hit.y >= pos.y - handleSize && hit.y <= pos.y + handleSize
    ) {
      return h;
    }
  }
  return null;
}

export function hitTestElement(
  worldX: number, worldY: number,
  el: CanvasElement
): boolean {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rotation = el.rotation || 0;
  const hit = rotation
    ? rotatePoint(worldX, worldY, cx, cy, -rotation)
    : { x: worldX, y: worldY };

  if (el.type === 'line' || el.type === 'arrow' || el.type === 'freehand') {
    const pts = el.data?.points || [{ x: el.x, y: el.y }, { x: el.x + el.width, y: el.y + el.height }];
    const tol = 5;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1];
      const A = hit.x - p1.x, B = hit.y - p1.y, C = p2.x - p1.x, D = p2.y - p1.y;
      const dot = A * C + B * D;
      const lenSq = C * C + D * D || 1;
      let t = Math.max(0, Math.min(1, dot / lenSq));
      const xx = p1.x + t * C, yy = p1.y + t * D;
      const dist = Math.sqrt((hit.x - xx) ** 2 + (hit.y - yy) ** 2);
      if (dist <= tol) return true;
    }
    return false;
  }

  if (el.type === 'polygon') {
    const pts = el.data?.points || [];
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y;
      const xj = pts[j].x, yj = pts[j].y;
      if (((yi > hit.y) !== (yj > hit.y)) &&
          (hit.x < (xj - xi) * (hit.y - yi) / (yj - yi || 0.0001) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  return pointInRect(hit.x, hit.y, el.x, el.y, el.width, el.height);
}

export function getExpandedSelection(ids: Set<string>, elements: Map<string, CanvasElement>): Set<string> {
  const result = new Set<string>();
  const groups = useCanvasStore.getState().groups;

  ids.forEach(id => {
    const el = elements.get(id);
    if (!el) return;
    if (el.groupId) {
      const groupIds = groups.get(el.groupId);
      groupIds?.forEach(gid => result.add(gid));
    } else {
      result.add(id);
    }
  });
  return result;
}

export function useCanvasInteraction(canvasRef: React.RefObject<HTMLCanvasElement>) {
  const store = useCanvasStore;
  const viewport = store(s => s.viewport);
  const currentTool = store(s => s.currentTool);
  const elements = store(s => s.elements);
  const selectedIds = store(s => s.selectedIds);
  const currentUser = store(s => s.currentUser);
  const currentCanvas = store(s => s.currentCanvas);

  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<Array<{ x: number; y: number }>>([]);

  const dragStartPos = useRef<{ x: number; y: number; worldX: number; worldY: number } | null>(null);
  const draggedElements = useRef<Map<string, { origX: number; origY: number }>>(new Map());
  const resizeStart = useRef<{
    handle: ResizeHandle;
    elements: Map<string, { origX: number; origY: number; origW: number; origH: number }>;
    centerX: number;
    centerY: number;
  } | null>(null);
  const connectionStart = useRef<{ fromId: string; fromPoint: string } | null>(null);
  const lastClickTime = useRef<number>(0);
  const lastClickPos = useRef<{ x: number; y: number } | null>(null);
  const dragMoved = useRef(false);
  const clipRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const canvasId = currentCanvas?.canvas.id;

  const getWorldCoords = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return screenToWorld(sx, sy, viewport);
  }, [canvasRef, viewport]);

  const sendOp = useCallback((type: string, payload: Record<string, any>) => {
    if (collabClient.isConnected()) {
      collabClient.sendOperation(type, payload);
    } else if (canvasId) {
      if (type === 'CREATE_ELEMENT') {
        elementApi.create(canvasId, payload).catch(console.error);
      } else if (type === 'UPDATE_ELEMENT') {
        elementApi.update(canvasId, payload.id, payload).catch(console.error);
      } else if (type === 'DELETE_ELEMENT') {
        elementApi.delete(canvasId, payload.id).catch(console.error);
      }
    }
  }, [canvasId]);

  const createElement = useCallback((type: ElementType, x: number, y: number, w = 100, h = 100, data = {}): CanvasElement => {
    const state = store.getState();
    const maxZ = Math.max(0, ...Array.from(state.elements.values()).map(e => e.zIndex || 0));
    const el: CanvasElement = {
      id: uid(),
      canvasId,
      type,
      x, y, width: w, height: h,
      rotation: 0,
      zIndex: maxZ + 1,
      opacity: 1,
      locked: false,
      visible: true,
      data: {
        strokeColor: state.strokeColor,
        fillColor: state.fillColor,
        strokeWidth: state.strokeWidth,
        fontSize: state.fontSize,
        ...data,
      },
    };
    state.addElement(el);
    sendOp('CREATE_ELEMENT', el);
    return el;
  }, [canvasId, store, sendOp]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (editingElementId) return;

    const { x: worldX, y: worldY } = getWorldCoords(e.clientX, e.clientY);
    const state = store.getState();
    const vp = state.viewport;

    if (currentTool === 'pan' || e.button === 1 || e.altKey || e.metaKey) {
      dragStartPos.current = { x: e.clientX, y: e.clientY, worldX: 0, worldY: 0 };
      state.setIsDragging(true);
      return;
    }

    if (currentTool === 'select') {
      const sortedEls = [...state.elements.values()]
        .filter(el => el.visible !== false && hitTestElement(worldX, worldY, el))
        .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
      const topEl = sortedEls[0];

      if (topEl) {
        for (const selId of state.selectedIds) {
          const selEl = state.elements.get(selId);
          if (!selEl || selEl.locked) continue;
          const handle = hitTestResizeHandle(worldX, worldY, selEl, vp.zoom);
          if (handle) {
            const resizeMap = new Map<string, { origX: number; origY: number; origW: number; origH: number }>();
            const expanded = getExpandedSelection(state.selectedIds, state.elements);
            let sumX = 0, sumY = 0, count = 0;
            expanded.forEach(id => {
              const el = state.elements.get(id);
              if (!el || el.locked) return;
              resizeMap.set(id, { origX: el.x, origY: el.y, origW: el.width, origH: el.height });
              sumX += el.x + el.width / 2;
              sumY += el.y + el.height / 2;
              count++;
            });
            resizeStart.current = {
              handle,
              elements: resizeMap,
              centerX: count ? sumX / count : worldX,
              centerY: count ? sumY / count : worldY,
            };
            dragStartPos.current = { x: e.clientX, y: e.clientY, worldX, worldY };
            return;
          }
        }

        const additive = e.shiftKey || e.ctrlKey;
        const exp = additive ? new Set(state.selectedIds) : new Set<string>();
        const alreadySel = state.selectedIds.has(topEl.id);
        if (topEl.groupId) {
          const gIds = state.groups.get(topEl.groupId) || [];
          if (additive && alreadySel) {
            gIds.forEach(id => exp.delete(id));
          } else {
            gIds.forEach(id => exp.add(id));
          }
        } else {
          if (additive && alreadySel) exp.delete(topEl.id);
          else exp.add(topEl.id);
        }
        state.setSelectedIds(exp);

        dragStartPos.current = { x: e.clientX, y: e.clientY, worldX, worldY };
        dragMoved.current = false;
        draggedElements.current.clear();
        const expanded = getExpandedSelection(state.selectedIds, state.elements);
        expanded.forEach(id => {
          const el = state.elements.get(id);
          if (!el || el.locked) return;
          draggedElements.current.set(id, { origX: el.x, origY: el.y });
        });
        state.setIsDragging(true);
        return;
      }

      clipRect.current = { x: worldX, y: worldY, w: 0, h: 0 };
      state.setSelectionBox(clipRect.current);
      dragStartPos.current = { x: e.clientX, y: e.clientY, worldX, worldY };
      state.setIsDragging(true);
      if (!e.shiftKey && !e.ctrlKey) {
        state.clearSelection();
      }
      return;
    }

    if (currentTool === 'connection') return;

    if (currentTool === 'text') {
      const el = createElement('text', worldX - 80, worldY - 15, 160, 30, {
        text: '双击编辑文本',
        align: 'left',
        color: state.strokeColor,
      });
      state.setSelectedIds([el.id]);
      setEditingElementId(el.id);
      return;
    }

    if (currentTool === 'sticky_note') {
      const el = createElement('sticky_note', worldX - 80, worldY - 50, 160, 100, {
        noteColor: '#FEF3C7',
        text: '便利贴',
        fontSize: 14,
        align: 'left',
      });
      state.setSelectedIds([el.id]);
      setEditingElementId(el.id);
      return;
    }

    if (currentTool === 'polygon') {
      const newPts = [...polygonPoints, { x: worldX, y: worldY }];
      setPolygonPoints(newPts);
      if (newPts.length >= 3) {
        const bbox = {
          minX: Math.min(...newPts.map(p => p.x)),
          minY: Math.min(...newPts.map(p => p.y)),
          maxX: Math.max(...newPts.map(p => p.x)),
          maxY: Math.max(...newPts.map(p => p.y)),
        };
        state.setPreviewElement({
          type: 'polygon',
          x: bbox.minX,
          y: bbox.minY,
          width: bbox.maxX - bbox.minX,
          height: bbox.maxY - bbox.minY,
          rotation: 0,
          data: { points: newPts },
        });
      }
      return;
    }

    if (['freehand', 'line', 'arrow', 'rectangle', 'circle', 'ellipse', 'diamond', 'mindnode', 'image'].includes(currentTool)) {
      dragStartPos.current = { x: e.clientX, y: e.clientY, worldX, worldY };
      state.setIsDrawing(true);

      if (currentTool === 'freehand') {
        const newPoints = [{ x: worldX, y: worldY }];
        state.setPreviewElement({
          type: 'freehand',
          x: worldX, y: worldY, width: 0, height: 0, rotation: 0,
          data: { points: newPoints },
        });
      } else if (currentTool === 'image') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (ev: any) => {
          const file = ev.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (r) => {
            const dataUrl = r.target?.result as string;
            const img = new Image();
            img.onload = () => {
              const ratio = img.width / img.height;
              const w = Math.min(300, img.width);
              const h = w / ratio;
              const el = createElement('image', worldX - w / 2, worldY - h / 2, w, h, {
                imageData: dataUrl,
              });
              state.setSelectedIds([el.id]);
            };
            img.src = dataUrl;
          };
          reader.readAsDataURL(file);
        };
        input.click();
      } else if (currentTool === 'mindnode') {
        const el = createElement('mindnode', worldX - 90, worldY - 25, 180, 50, {
          text: '中心主题',
          fontSize: 16,
          bold: true,
          fillColor: '#EFF6FF',
          strokeColor: '#2563EB',
          shape: 'rounded',
        });
        state.setSelectedIds([el.id]);
        setEditingElementId(el.id);
      } else {
        state.setPreviewElement({
          type: currentTool as ElementType,
          x: worldX, y: worldY, width: 0, height: 0, rotation: 0,
          data: { strokeColor: state.strokeColor, fillColor: state.fillColor, strokeWidth: state.strokeWidth },
        });
      }
    }
  }, [currentTool, editingElementId, getWorldCoords, store, createElement, polygonPoints]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { x: worldX, y: worldY } = getWorldCoords(e.clientX, e.clientY);
    const state = store.getState();
    const vp = state.viewport;

    throttle(() => {
      collabClient.sendCursor(worldX, worldY);
    }, 50)();

    if (connectionStart.current) {
      state.setPreviewConnection({
        fromId: connectionStart.current.fromId,
        fromPoint: connectionStart.current.fromPoint,
        toX: worldX, toY: worldY,
      });
      return;
    }

    if (currentTool === 'pan' || dragStartPos.current && (e.buttons === 4 || e.altKey || e.metaKey)) {
      if (dragStartPos.current) {
        const dx = (e.clientX - dragStartPos.current.x) / vp.zoom;
        const dy = (e.clientY - dragStartPos.current.y) / vp.zoom;
        state.setViewport({ x: vp.x - dx, y: vp.y - dy });
        dragStartPos.current.x = e.clientX;
        dragStartPos.current.y = e.clientY;
      }
      return;
    }

    if (resizeStart.current && dragStartPos.current) {
      const dx = worldX - dragStartPos.current.worldX;
      const dy = worldY - dragStartPos.current.worldY;
      const { handle, elements: resEls, centerX, centerY } = resizeStart.current;

      resEls.forEach((orig, id) => {
        const el = state.elements.get(id);
        if (!el) return;
        let newX = orig.origX, newY = orig.origY, newW = orig.origW, newH = orig.origH;

        const scaledDx = dx;
        const scaledDy = dy;

        if (handle.includes('Left')) {
          newX = orig.origX + scaledDx;
          newW = orig.origW - scaledDx;
        }
        if (handle.includes('Right')) {
          newW = orig.origW + scaledDx;
        }
        if (handle.includes('Top')) {
          newY = orig.origY + scaledDy;
          newH = orig.origH - scaledDy;
        }
        if (handle.includes('Bottom')) {
          newH = orig.origH + scaledDy;
        }

        if (newW < 10) { newX = orig.origX + orig.origW - 10; newW = 10; }
        if (newH < 10) { newY = orig.origY + orig.origH - 10; newH = 10; }

        state.updateElement(id, { x: newX, y: newY, width: newW, height: newH });
      });
      return;
    }

    if (state.isDrawing && dragStartPos.current) {
      const startX = dragStartPos.current.worldX;
      const startY = dragStartPos.current.worldY;
      const dx = worldX - startX;
      const dy = worldY - startY;

      if (currentTool === 'freehand') {
        const preview = state.previewElement;
        if (preview && preview.data?.points) {
          const newPts = [...preview.data.points, { x: worldX, y: worldY }];
          const bbox = {
            minX: Math.min(...newPts.map(p => p.x)),
            minY: Math.min(...newPts.map(p => p.y)),
            maxX: Math.max(...newPts.map(p => p.x)),
            maxY: Math.max(...newPts.map(p => p.y)),
          };
          state.setPreviewElement({
            ...preview,
            x: bbox.minX, y: bbox.minY,
            width: bbox.maxX - bbox.minX,
            height: bbox.maxY - bbox.minY,
            data: { ...preview.data, points: newPts },
          });
        }
      } else {
        let w = dx, h = dy;
        let x = startX, y = startY;

        if (currentTool === 'circle') {
          const size = Math.max(Math.abs(w), Math.abs(h));
          w = Math.sign(w || 1) * size;
          h = Math.sign(h || 1) * size;
        }

        if (e.shiftKey && currentTool !== 'line' && currentTool !== 'arrow') {
          const size = Math.max(Math.abs(w), Math.abs(h));
          w = Math.sign(w || 1) * size;
          h = Math.sign(h || 1) * size;
        }

        if (w < 0) { x = startX + w; w = Math.abs(w); }
        if (h < 0) { y = startY + h; h = Math.abs(h); }

        if (currentTool === 'line' || currentTool === 'arrow') {
          const sx = Math.min(startX, worldX);
          const sy = Math.min(startY, worldY);
          const pts = [{ x: startX, y: startY }, { x: worldX, y: worldY }];
          state.setPreviewElement({
            type: currentTool as ElementType,
            x: sx, y: sy,
            width: Math.abs(worldX - startX) || 1,
            height: Math.abs(worldY - startY) || 1,
            rotation: 0,
            data: {
              points: pts,
              strokeColor: state.strokeColor,
              strokeWidth: state.strokeWidth,
              arrowEnd: true,
            },
          });
        } else {
          state.setPreviewElement({
            type: currentTool as ElementType,
            x, y, width: w, height: h, rotation: 0,
            data: {
              strokeColor: state.strokeColor,
              fillColor: state.fillColor,
              strokeWidth: state.strokeWidth,
            },
          });
        }
      }
      return;
    }

    if (state.isDragging && dragStartPos.current && !clipRect.current) {
      dragMoved.current = true;
      const dx = worldX - dragStartPos.current.worldX;
      const dy = worldY - dragStartPos.current.worldY;

      draggedElements.current.forEach((orig, id) => {
        state.updateElement(id, {
          x: orig.origX + dx,
          y: orig.origY + dy,
        });
      });
      return;
    }

    if (clipRect.current && dragStartPos.current) {
      clipRect.current.w = worldX - dragStartPos.current.worldX;
      clipRect.current.h = worldY - dragStartPos.current.worldY;
      state.setSelectionBox({ ...clipRect.current });

      const bx = clipRect.current.w >= 0 ? dragStartPos.current.worldX : worldX;
      const by = clipRect.current.h >= 0 ? dragStartPos.current.worldY : worldY;
      const bw = Math.abs(clipRect.current.w);
      const bh = Math.abs(clipRect.current.h);

      if (bw > 2 || bh > 2) {
        const boxRect = { x: bx, y: by, w: bw, h: bh };
        const newSel = new Set<string>(state.selectedIds);
        state.elements.forEach(el => {
          if (!el.visible || el.locked) return;
          const bbox = getElementBBox(el);
          const elRect = { x: bbox.minX, y: bbox.minY, w: bbox.maxX - bbox.minX, h: bbox.maxY - bbox.minY };
          if (rectsIntersect(boxRect, elRect)) {
            newSel.add(el.id);
          }
        });
        state.setSelectedIds(newSel);
      }
      return;
    }
  }, [currentTool, getWorldCoords, store]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const { x: worldX, y: worldY } = getWorldCoords(e.clientX, e.clientY);
    const state = store.getState();

    if (connectionStart.current && state.previewConnection) {
      const { fromId, fromPoint } = connectionStart.current;
      let targetEl: CanvasElement | null = null;
      for (const el of state.elements.values()) {
        if (el.id === fromId || el.type === 'line' || el.type === 'arrow' || el.type === 'freehand') continue;
        if (hitTestElement(worldX, worldY, el)) {
          if (!targetEl || (el.zIndex || 0) > (targetEl.zIndex || 0)) {
            targetEl = el;
          }
        }
      }
      if (targetEl) {
        const maxZ = Math.max(0, ...Array.from(state.connections.values()).map(c => c.zIndex || 0));
        const conn: CanvasConnection = {
          id: uid(),
          canvasId,
          fromElementId: fromId,
          toElementId: targetEl.id,
          fromPoint,
          toPoint: 'auto',
          style: 'curve',
          arrowStyle: 'end',
          color: state.strokeColor,
          thickness: state.strokeWidth,
          waypoints: [],
          zIndex: maxZ + 1,
        };
        state.addConnection(conn);
        if (collabClient.isConnected()) {
          collabClient.sendOperation('CREATE_CONNECTION', conn);
        } else if (canvasId) {
          elementApi.createConnection(canvasId, conn).catch(console.error);
        }
      }
      connectionStart.current = null;
      state.setPreviewConnection(null);
      return;
    }

    if (resizeStart.current) {
      resizeStart.current.elements.forEach((_orig, id) => {
        const el = state.elements.get(id);
        if (!el) return;
        sendOp('UPDATE_ELEMENT', {
          id: el.id,
          x: el.x, y: el.y, width: el.width, height: el.height,
        });
      });
      resizeStart.current = null;
    }

    if (state.isDrawing && state.previewElement) {
      const prev = state.previewElement;
      const minW = prev.type === 'line' || prev.type === 'arrow' ? 1 : 5;
      const minH = prev.type === 'line' || prev.type === 'arrow' ? 1 : 5;
      if ((prev.width ?? 0) > minW || (prev.height ?? 0) > minH ||
          (prev.data?.points && prev.data.points.length > 2)) {
        const maxZ = Math.max(0, ...Array.from(state.elements.values()).map(el => el.zIndex || 0));
        const el: CanvasElement = {
          id: uid(),
          canvasId,
          type: prev.type as ElementType,
          x: prev.x!,
          y: prev.y!,
          width: prev.width!,
          height: prev.height!,
          rotation: prev.rotation || 0,
          zIndex: maxZ + 1,
          opacity: 1,
          locked: false,
          visible: true,
          data: deepClone(prev.data || {}),
        };
        state.addElement(el);
        sendOp('CREATE_ELEMENT', el);
        state.setSelectedIds([el.id]);
      }
      state.setPreviewElement(null);
      state.setIsDrawing(false);
    }

    if (state.isDragging && draggedElements.current.size > 0 && dragMoved.current) {
      draggedElements.current.forEach((_orig, id) => {
        const el = state.elements.get(id);
        if (!el) return;
        sendOp('UPDATE_ELEMENT', { id: el.id, x: el.x, y: el.y });
      });
    }

    if (clipRect.current) {
      state.setSelectionBox(null);
      clipRect.current = null;
    }

    const now = Date.now();
    if (currentTool === 'select' && !dragMoved.current &&
        lastClickPos.current &&
        Math.abs(e.clientX - lastClickPos.current.x) < 5 &&
        Math.abs(e.clientY - lastClickPos.current.y) < 5 &&
        now - lastClickTime.current < 350) {
      const sortedEls = [...state.elements.values()]
        .filter(el => el.visible !== false && hitTestElement(worldX, worldY, el))
        .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
      const topEl = sortedEls[0];
      if (topEl && (topEl.type === 'text' || topEl.type === 'sticky_note' || topEl.type === 'mindnode')) {
        if (!topEl.locked) {
          setEditingElementId(topEl.id);
          state.setSelectedIds([topEl.id]);
        }
      }
    }
    lastClickTime.current = now;
    lastClickPos.current = { x: e.clientX, y: e.clientY };

    dragStartPos.current = null;
    dragMoved.current = false;
    draggedElements.current.clear();
    state.setIsDragging(false);
  }, [canvasId, currentTool, getWorldCoords, sendOp, store]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const { x: worldX, y: worldY } = getWorldCoords(e.clientX, e.clientY);
    const state = store.getState();

    if (currentTool === 'polygon') {
      if (polygonPoints.length >= 3) {
        const pts = [...polygonPoints];
        const bbox = {
          minX: Math.min(...pts.map(p => p.x)),
          minY: Math.min(...pts.map(p => p.y)),
          maxX: Math.max(...pts.map(p => p.x)),
          maxY: Math.max(...pts.map(p => p.y)),
        };
        const maxZ = Math.max(0, ...Array.from(state.elements.values()).map(el => el.zIndex || 0));
        const el: CanvasElement = {
          id: uid(),
          canvasId,
          type: 'polygon',
          x: bbox.minX, y: bbox.minY,
          width: bbox.maxX - bbox.minX,
          height: bbox.maxY - bbox.minY,
          rotation: 0,
          zIndex: maxZ + 1,
          opacity: 1,
          locked: false,
          visible: true,
          data: {
            points: pts,
            strokeColor: state.strokeColor,
            fillColor: state.fillColor,
            strokeWidth: state.strokeWidth,
          },
        };
        state.addElement(el);
        sendOp('CREATE_ELEMENT', el);
        state.setSelectedIds([el.id]);
      }
      setPolygonPoints([]);
      state.setPreviewElement(null);
      return;
    }

    const sortedEls = [...state.elements.values()]
      .filter(el => el.visible !== false && hitTestElement(worldX, worldY, el))
      .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
    const topEl = sortedEls[0];
    if (topEl && (topEl.type === 'text' || topEl.type === 'sticky_note' || topEl.type === 'mindnode')) {
      if (!topEl.locked) {
        setEditingElementId(topEl.id);
        state.setSelectedIds([topEl.id]);
      }
    }
  }, [canvasId, currentTool, getWorldCoords, polygonPoints, sendOp, store]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const state = store.getState();
    const vp = state.viewport;
    const { x: worldX, y: worldY } = getWorldCoords(e.clientX, e.clientY);

    const factor = e.ctrlKey ? 0.002 : 0.0015;
    const delta = -(e.deltaY + e.deltaX) * factor;
    const newZoom = Math.max(0.1, Math.min(5, vp.zoom * (1 + delta)));
    const zoomRatio = newZoom / vp.zoom;

    const newX = worldX - (worldX - vp.x) / zoomRatio;
    const newY = worldY - (worldY - vp.y) / zoomRatio;

    state.setViewport({ x: newX, y: newY, zoom: newZoom });
    throttle(() => collabClient.sendViewport(newX, newY, newZoom), 500)();
  }, [getWorldCoords, store]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (editingElementId) return;

    const state = store.getState();
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedIds.size > 0) {
      e.preventDefault();
      const ids = Array.from(state.selectedIds);
      const expanded = getExpandedSelection(state.selectedIds, state.elements);
      expanded.forEach(id => state.deleteElement(id));
      if (collabClient.isConnected()) {
        collabClient.sendOperation('BATCH_DELETE_ELEMENTS', { ids: Array.from(expanded) });
      } else if (canvasId) {
        elementApi.batchDelete(canvasId, Array.from(expanded)).catch(console.error);
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      const ids = Array.from(state.elements.values()).filter(el => !el.locked && el.visible).map(el => el.id);
      state.setSelectedIds(ids);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && state.selectedIds.size > 0) {
      const clipboardData: any = {
        type: 'collab-elements',
        elements: Array.from(state.selectedIds).map(id => state.elements.get(id)).filter(Boolean),
      };
      try {
        navigator.clipboard.writeText(JSON.stringify(clipboardData));
      } catch {}
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      navigator.clipboard.readText().then(text => {
        try {
          const data = JSON.parse(text);
          if (data.type === 'collab-elements' && Array.isArray(data.elements)) {
            const offset = 20;
            const maxZ = Math.max(0, ...Array.from(state.elements.values()).map(el => el.zIndex || 0));
            const newEls: CanvasElement[] = data.elements.map((el: CanvasElement, i: number) => ({
              ...deepClone(el),
              id: uid(),
              x: el.x + offset,
              y: el.y + offset,
              zIndex: Number(maxZ) + 1 + Number(i),
              versionVector: undefined,
            }));
            newEls.forEach(el => {
              state.addElement(el);
              sendOp('CREATE_ELEMENT', el);
            });
            state.setSelectedIds(newEls.map(el => el.id));
          }
        } catch {}
      }).catch(() => {});
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'd' && state.selectedIds.size > 0) {
      e.preventDefault();
      const expanded = getExpandedSelection(state.selectedIds, state.elements);
      const offset = 20;
      const maxZ = Math.max(0, ...Array.from(state.elements.values()).map(el => el.zIndex || 0));
      const newEls: CanvasElement[] = [];
      expanded.forEach((id, i) => {
        const el = state.elements.get(id);
        if (!el) return;
        const newEl: CanvasElement = {
          ...deepClone(el),
          id: uid(),
          x: el.x + offset,
          y: el.y + offset,
          zIndex: Number(maxZ) + 1 + Number(i),
          versionVector: undefined,
        };
        newEls.push(newEl);
      });
      newEls.forEach(el => {
        state.addElement(el);
        sendOp('CREATE_ELEMENT', el);
      });
      state.setSelectedIds(newEls.map(el => el.id));
      return;
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && state.selectedIds.size > 0) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      const expanded = getExpandedSelection(state.selectedIds, state.elements);
      expanded.forEach(id => {
        const el = state.elements.get(id);
        if (!el || el.locked) return;
        state.updateElement(id, { x: el.x + dx, y: el.y + dy });
        sendOp('UPDATE_ELEMENT', { id, x: el.x + dx, y: el.y + dy });
      });
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'g' && state.selectedIds.size > 1) {
      e.preventDefault();
      state.groupElements(Array.from(state.selectedIds));
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      const first = [...state.selectedIds][0];
      const el = state.elements.get(first);
      if (el?.groupId) {
        state.ungroupElements(el.groupId);
      }
      return;
    }

    if (e.key === 'Escape') {
      if (polygonPoints.length > 0) {
        setPolygonPoints([]);
        state.setPreviewElement(null);
      }
      if (connectionStart.current) {
        connectionStart.current = null;
        state.setPreviewConnection(null);
      }
      state.clearSelection();
      return;
    }

    const toolMap: Record<string, Tool> = {
      'v': 'select', 'h': 'pan', 'p': 'freehand',
      'l': 'line', 'a': 'arrow', 'r': 'rectangle',
      'o': 'ellipse', 'd': 'diamond', 'y': 'polygon',
      't': 'text', 's': 'sticky_note', 'i': 'image',
    };
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const tool = toolMap[e.key.toLowerCase()];
      if (tool) {
        state.setCurrentTool(tool);
      }
    }
  }, [canvasId, editingElementId, polygonPoints, sendOp, store]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const state = store.getState();
    if (editingElementId) return;

    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            const reader = new FileReader();
            reader.onload = (r) => {
              const dataUrl = r.target?.result as string;
              const img = new Image();
              img.onload = () => {
                const ratio = img.width / img.height;
                const w = Math.min(400, img.width);
                const h = w / ratio;
                const { x, y } = screenToWorld(window.innerWidth / 2, window.innerHeight / 2, state.viewport);
                const maxZ = Math.max(0, ...Array.from(state.elements.values()).map(el => el.zIndex || 0));
                const el: CanvasElement = {
                  id: uid(),
                  canvasId,
                  type: 'image',
                  x: x - w / 2, y: y - h / 2, width: w, height: h,
                  rotation: 0, zIndex: maxZ + 1,
                  opacity: 1, locked: false, visible: true,
                  data: { imageData: dataUrl },
                };
                state.addElement(el);
                sendOp('CREATE_ELEMENT', el);
                state.setSelectedIds([el.id]);
              };
              img.src = dataUrl;
            };
            reader.readAsDataURL(file);
            return;
          }
        }
      }
    }
  }, [canvasId, editingElementId, sendOp, store]);

  const startConnection = useCallback((fromId: string, fromPoint: string) => {
    connectionStart.current = { fromId, fromPoint };
  }, []);

  const finishEditing = useCallback((elementId: string, text: string, data: Partial<CanvasElement['data']> = {}) => {
    const state = store.getState();
    const el = state.elements.get(elementId);
    if (!el) {
      setEditingElementId(null);
      return;
    }
    state.updateElement(elementId, {
      data: { ...el.data, text, ...data },
    });
    sendOp('UPDATE_ELEMENT', {
      id: elementId,
      data: { ...el.data, text, ...data },
    });
    setEditingElementId(null);
  }, [sendOp, store]);

  const cancelEditing = useCallback(() => {
    setEditingElementId(null);
  }, []);

  const getEditingElement = useCallback(() => {
    if (!editingElementId) return null;
    return store.getState().elements.get(editingElementId) || null;
  }, [editingElementId, store]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => handleKeyDown(e);
    const onPaste = (e: ClipboardEvent) => handlePaste(e);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPaste);
    };
  }, [handleKeyDown, handlePaste]);

  useEffect(() => {
    const sel = Array.from(store.getState().selectedIds);
    throttle(() => {
      collabClient.sendSelection(sel);
    }, 100)();
  }, [selectedIds, store]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    handleWheel,
    editingElementId,
    getEditingElement,
    finishEditing,
    cancelEditing,
    polygonPoints,
    startConnection,
  };
}
