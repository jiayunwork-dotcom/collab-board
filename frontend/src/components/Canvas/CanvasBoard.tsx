import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import { CanvasRenderer } from '@/canvas/CanvasRenderer';
import { collabClient } from '@/collaboration/CollabClient';
import { elementApi, commentApi } from '@/api/client';
import type { CanvasElement, Tool, ElementType } from '@/types';
import { uid, clamp, pointInRect, getElementBBox, deepClone, throttle, debounce } from '@/utils';
import { screenToWorld, worldToScreen } from '@/canvas/geometry';
import MiniMap from './MiniMap';
import CommentLayer from './CommentLayer';
import { pluginManager } from '@/plugin/PluginManager';

const MAX_ZOOM = 10;
const MIN_ZOOM = 0.1;

interface DragState {
  type: 'select' | 'pan' | 'draw' | 'move' | 'resize' | 'connect';
  startX: number;
  startY: number;
  startWorldX: number;
  startWorldY: number;
  lastWorldX: number;
  lastWorldY: number;
  moved: boolean;
  targetId?: string;
  originalPositions?: Map<string, { x: number; y: number }>;
  handleIndex?: number;
  originalElement?: CanvasElement;
  freehandPoints?: Array<{ x: number; y: number }>;
}

const CanvasBoard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const animationFrameRef = useRef<number>(0);
  const dragStateRef = useRef<DragState | null>(null);
  const spacePressedRef = useRef(false);
  const editingRef = useRef<{ elementId: string; input: HTMLTextAreaElement } | null>(null);
  const [editingText, setEditingText] = useState<{ elementId: string; x: number; y: number; width: number; height: number; text: string; fontSize: number; color: string; align: 'left' | 'center' | 'right' } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: string | null } | null>(null);

  const {
    currentCanvas,
    elements,
    connections,
    viewport,
    setViewport,
    selectedIds,
    setSelectedIds,
    toggleSelected,
    clearSelection,
    currentTool,
    setCurrentTool,
    strokeColor,
    fillColor,
    strokeWidth,
    fontSize,
    addElement,
    updateElement,
    deleteElement,
    addConnection,
    onlineUsers,
    remoteCursors,
    remoteSelections,
    previewElement,
    setPreviewElement,
    setPreviewConnection,
    setIsDragging,
    setIsDrawing,
    setSelectionBox,
    updateCanvasMeta,
    canvasRole,
    addComment,
    setCommentReplies,
    setOpenCommentId,
  } = useCanvasStore();

  const canvasId = currentCanvas?.canvas.id;

  const getMaxZIndex = useCallback(() => {
    let max = 0;
    elements.forEach(el => {
      if (el.zIndex > max) max = el.zIndex;
    });
    return max + 1;
  }, [elements]);

  const hitTest = useCallback((wx: number, wy: number): string | null => {
    const sorted = [...elements.values()]
      .filter(el => el.visible !== false && el.locked !== true)
      .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

    for (const el of sorted) {
      const bbox = getElementBBox(el);
      if (pointInRect(wx, wy, bbox.minX - 4, bbox.minY - 4, bbox.maxX - bbox.minX + 8, bbox.maxY - bbox.minY + 8)) {
        if (el.groupId) {
          return el.groupId;
        }
        return el.id;
      }
    }
    return null;
  }, [elements]);

  const getSelectionBBox = useCallback((ids: Set<string>): { minX: number; minY: number; maxX: number; maxY: number } | null => {
    const allEls: CanvasElement[] = [];
    ids.forEach(id => {
      const el = elements.get(id);
      if (el) allEls.push(el);
      else {
        elements.forEach(e => {
          if (e.groupId === id) allEls.push(e);
        });
      }
    });
    if (allEls.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allEls.forEach(el => {
      const bbox = getElementBBox(el);
      minX = Math.min(minX, bbox.minX);
      minY = Math.min(minY, bbox.minY);
      maxX = Math.max(maxX, bbox.maxX);
      maxY = Math.max(maxY, bbox.maxY);
    });
    return { minX, minY, maxX, maxY };
  }, [elements]);

  const render = useCallback(() => {
    if (!canvasRef.current || !rendererRef.current) return;
    const renderer = rendererRef.current;
    const options = {
      viewport,
      showGrid: currentCanvas?.canvas.backgroundType !== 'SOLID',
      showSelectionHandles: true,
    };

    renderer.clear();
    renderer.drawBackground(
      options,
      currentCanvas?.canvas.backgroundType || 'GRID_DOTS',
      currentCanvas?.canvas.backgroundColor || '#FFFFFF',
      currentCanvas?.canvas.gridSize || 40
    );

    const elementsArr = [...elements.values()];
    renderer.drawConnections([...connections.values()], elements, options);
    renderer.drawElements(elementsArr, options);
    renderer.drawSelection(selectedIds, elementsArr, options);
    renderer.drawRemoteSelections(remoteSelections, onlineUsers, elementsArr, options);
    renderer.drawRemoteCursors(remoteCursors, onlineUsers, options);
    renderer.drawSelectionBox(useCanvasStore.getState().selectionBox, options);

    animationFrameRef.current = requestAnimationFrame(render);
  }, [viewport, currentCanvas, elements, connections, selectedIds, onlineUsers, remoteCursors, remoteSelections]);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [render]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (!rendererRef.current) {
          rendererRef.current = new CanvasRenderer(ctx, rect.width, rect.height, dpr);
        } else {
          rendererRef.current.resize(rect.width, rect.height, dpr);
        }
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const createElement = useCallback((type: ElementType, wx: number, wy: number, partial?: Partial<CanvasElement>): CanvasElement => {
    const zIndex = getMaxZIndex();
    const baseWidth = type === 'circle' || type === 'ellipse' ? 120 : type === 'diamond' ? 120 : 180;
    const baseHeight = type === 'circle' || type === 'ellipse' ? 120 : type === 'diamond' ? 100 : 80;
    const el: CanvasElement = {
      id: uid(),
      type,
      x: wx,
      y: wy,
      width: partial?.width ?? baseWidth,
      height: partial?.height ?? baseHeight,
      rotation: 0,
      zIndex,
      opacity: 1,
      locked: false,
      visible: true,
      data: {
        strokeColor,
        fillColor,
        strokeWidth,
        fontSize,
        text: partial?.data?.text ?? (type === 'sticky_note' ? '便签' : type === 'text' ? '文本' : type === 'mindnode' ? '主题' : ''),
        noteColor: type === 'sticky_note' ? '#FEF3C7' : undefined,
        ...(partial?.data || {}),
      },
      ...partial,
    };
    return el;
  }, [strokeColor, fillColor, strokeWidth, fontSize, getMaxZIndex]);

  const finishDraw = useCallback((el: CanvasElement) => {
    addElement(el);
    if (canvasId && canvasRole && canvasRole !== 'VIEWER' && canvasRole !== 'PUBLIC') {
      elementApi.create(canvasId, el).catch(console.error);
      collabClient.sendOperation('CREATE_ELEMENT', el);
    }
    setSelectedIds([el.id]);
  }, [addElement, setSelectedIds, canvasId, canvasRole]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy, viewport);

    const isEditable = canvasRole && canvasRole !== 'VIEWER' && canvasRole !== 'PUBLIC';
    const tool: Tool = (spacePressedRef.current || e.button === 1) ? 'pan' : currentTool;

    setIsDragging(true);

    const baseState: DragState = {
      type: 'select',
      startX: sx,
      startY: sy,
      startWorldX: world.x,
      startWorldY: world.y,
      lastWorldX: world.x,
      lastWorldY: world.y,
      moved: false,
    };

    if (tool === 'pan' || e.button === 1) {
      dragStateRef.current = { ...baseState, type: 'pan' };
      return;
    }

    if (!isEditable) {
      const hitId = hitTest(world.x, world.y);
      if (hitId && !e.shiftKey) {
        setSelectedIds([hitId]);
      }
      dragStateRef.current = { ...baseState, type: 'pan' };
      return;
    }

    const hitId = hitTest(world.x, world.y);

    if (tool === 'select') {
      if (hitId) {
        if (!selectedIds.has(hitId)) {
          if (e.shiftKey) {
            toggleSelected(hitId, true);
          } else {
            setSelectedIds([hitId]);
          }
        }
        const positions = new Map<string, { x: number; y: number }>();
        const effectiveIds = new Set<string>();
        if (hitId && !elements.has(hitId)) {
          elements.forEach(el => {
            if (el.groupId === hitId) {
              positions.set(el.id, { x: el.x, y: el.y });
              effectiveIds.add(el.id);
            }
          });
        } else {
          selectedIds.forEach(id => {
            if (id && !elements.has(id)) {
              elements.forEach(el => {
                if (el.groupId === id) {
                  positions.set(el.id, { x: el.x, y: el.y });
                  effectiveIds.add(el.id);
                }
              });
            } else {
              const el = elements.get(id);
              if (el) {
                positions.set(id, { x: el.x, y: el.y });
                effectiveIds.add(id);
              }
            }
          });
          if (!effectiveIds.has(hitId) && elements.has(hitId)) {
            const el = elements.get(hitId)!;
            positions.set(hitId, { x: el.x, y: el.y });
            effectiveIds.add(hitId);
          }
        }
        dragStateRef.current = {
          ...baseState,
          type: 'move',
          targetId: hitId,
          originalPositions: positions,
        };
      } else {
        if (!e.shiftKey) clearSelection();
        dragStateRef.current = { ...baseState, type: 'select' };
      }
      return;
    }

    if (tool === 'comment') {
      dragStateRef.current = { ...baseState, type: 'select' };
      return;
    }

    if (tool === 'freehand') {
      const pts = [{ x: world.x, y: world.y }];
      dragStateRef.current = {
        ...baseState,
        type: 'draw',
        freehandPoints: pts,
      };
      setIsDrawing(true);
      return;
    }

    if (tool === 'connection') {
      if (hitId) {
        const targetEl = elements.get(hitId);
        if (targetEl) {
          setPreviewConnection({
            fromId: hitId,
            fromPoint: 'auto',
            toX: world.x,
            toY: world.y,
          });
          dragStateRef.current = {
            ...baseState,
            type: 'connect',
            targetId: hitId,
          };
        }
      }
      return;
    }

    if (['rectangle', 'circle', 'ellipse', 'diamond', 'sticky_note', 'image', 'text', 'mindnode', 'line', 'arrow', 'polygon'].includes(tool)) {
      const type = tool as ElementType;
      if (type === 'text' || type === 'sticky_note' || type === 'mindnode' || type === 'image') {
        const el = createElement(type, world.x, world.y);
        finishDraw(el);
        if (type === 'text' || type === 'sticky_note' || type === 'mindnode') {
          setTimeout(() => startEditing(el.id), 50);
        }
        setCurrentTool('select');
        dragStateRef.current = null;
        setIsDragging(false);
        return;
      }
      const el = createElement(type, world.x, world.y, {
        width: 1,
        height: 1,
      });
      dragStateRef.current = {
        ...baseState,
        type: 'draw',
        targetId: el.id,
        originalElement: deepClone(el),
      };
      setPreviewElement(el);
      setIsDrawing(true);
      return;
    }
  }, [viewport, currentTool, canvasRole, hitTest, selectedIds, elements, createElement, finishDraw, toggleSelected, setSelectedIds, clearSelection, setIsDragging, setIsDrawing, setPreviewElement, setPreviewConnection, setCurrentTool]);

  const handleMouseMove = useCallback(throttle((e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy, viewport);

    collabClient.sendCursor(world.x, world.y);

    const state = dragStateRef.current;
    if (!state) return;

    state.moved = true;

    if (state.type === 'pan') {
      const dx = sx - state.startX;
      const dy = sy - state.startY;
      setViewport({
        x: (state as DragState).startWorldX - dx / viewport.zoom,
        y: (state as DragState).startWorldY - dy / viewport.zoom,
      });
      return;
    }

    if (state.type === 'select') {
      const w = world.x - (state as DragState).startWorldX;
      const h = world.y - (state as DragState).startWorldY;
      setSelectionBox({
        x: (state as DragState).startWorldX,
        y: (state as DragState).startWorldY,
        w,
        h,
      });
      const selBox = {
        x: w >= 0 ? (state as DragState).startWorldX : world.x,
        y: h >= 0 ? (state as DragState).startWorldY : world.y,
        w: Math.abs(w),
        h: Math.abs(h),
      };
      if (selBox.w > 5 || selBox.h > 5) {
        const ids = new Set<string>();
        elements.forEach(el => {
          if (el.visible === false) return;
          const bbox = getElementBBox(el);
          if (bbox.minX >= selBox.x && bbox.minY >= selBox.y && bbox.maxX <= selBox.x + selBox.w && bbox.maxY <= selBox.y + selBox.h) {
            ids.add(el.groupId || el.id);
          }
        });
        if (ids.size > 0) {
          const flattened = new Set<string>();
          ids.forEach(id => {
            if (elements.has(id)) flattened.add(id);
            else {
              elements.forEach(el => {
                if (el.groupId === id) flattened.add(el.id);
              });
            }
          });
          setSelectedIds([...flattened]);
        }
      }
      return;
    }

    if (state.type === 'move' && state.originalPositions) {
      const dx = world.x - (state as DragState).startWorldX;
      const dy = world.y - (state as DragState).startWorldY;
      state.originalPositions.forEach((pos, id) => {
        updateElement(id, {
          x: pos.x + dx,
          y: pos.y + dy,
        });
      });
      (state as DragState).lastWorldX = world.x;
      (state as DragState).lastWorldY = world.y;
      return;
    }

    if (state.type === 'draw') {
      if (currentTool === 'freehand' && state.freehandPoints) {
        state.freehandPoints.push({ x: world.x, y: world.y });
        const pts = state.freehandPoints;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        pts.forEach(p => {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        });
        setPreviewElement({
          ...createElement('freehand', minX, minY, {
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY),
            data: { points: pts.map(p => ({ x: p.x - minX, y: p.y - minY })) },
          }),
        });
      } else if (state.targetId && state.originalElement) {
        let w = world.x - (state as DragState).startWorldX;
        let h = world.y - (state as DragState).startWorldY;
        let startX = (state as DragState).startWorldX;
        let startY = (state as DragState).startWorldY;
        if (e.shiftKey && (currentTool === 'circle' || currentTool === 'line')) {
          const absMax = Math.max(Math.abs(w), Math.abs(h));
          w = Math.sign(w) * absMax;
          h = Math.sign(h || w) * absMax;
        }
        if (w < 0) { startX = world.x; w = -w; }
        if (h < 0) { startY = world.y; h = -h; }
        w = Math.max(1, w);
        h = Math.max(1, h);
        const type = currentTool as ElementType;
        if (type === 'line' || type === 'arrow') {
          const pts = [{ x: 0, y: 0 }, { x: w, y: h }];
          setPreviewElement({
            ...createElement(type, startX, startY, {
              width: w,
              height: h,
              data: {
                points: pts,
                arrowEnd: type === 'arrow',
              },
            }),
          });
        } else if (type === 'polygon') {
          if (!state.freehandPoints) {
            state.freehandPoints = [{ x: startX, y: startY }];
          }
          state.freehandPoints.push({ x: world.x, y: world.y });
        } else {
          setPreviewElement({
            ...createElement(type, startX, startY, {
              width: w,
              height: h,
            }),
          });
        }
      }
      return;
    }

    if (state.type === 'connect') {
      setPreviewConnection({
        fromId: (state as DragState).targetId!,
        fromPoint: 'auto',
        toX: world.x,
        toY: world.y,
      });
    }
  }, 16), [viewport, elements, setViewport, setSelectionBox, setSelectedIds, updateElement, setPreviewElement, setPreviewConnection, currentTool, createElement]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    setIsDragging(false);
    setIsDrawing(false);

    const state = dragStateRef.current;
    if (!state) return;

    if (state.type === 'select') {
      setSelectionBox(null);
      if (!state.moved && currentTool === 'select') {
        if (!e.shiftKey) {
          const rect = canvasRef.current!.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const world = screenToWorld(sx, sy, viewport);
          const hitId = hitTest(world.x, world.y);
          if (!hitId) clearSelection();
        }
      }
    }

    // 评论工具：点击空白处创建评论锚点
    if (!state.moved && currentTool === 'comment' && canComment && canvasId) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy, viewport);
      commentApi.create(canvasId, {
        anchorX: world.x,
        anchorY: world.y,
      }).then(data => {
        addComment(data.comment);
        if (data.replies && data.replies.length > 0) {
          setCommentReplies(data.comment.id, data.replies);
        }
        setOpenCommentId(data.comment.id);
        setCurrentTool('select');
      }).catch(e => console.error('Failed to create comment', e));
      dragStateRef.current = null;
      setIsDragging(false);
      return;
    }

    if (state.type === 'move' && state.moved && state.originalPositions) {
      const isEditable = canvasRole && canvasRole !== 'VIEWER' && canvasRole !== 'PUBLIC';
      state.originalPositions.forEach((_, id) => {
        const el = elements.get(id);
        if (el && isEditable) {
          elementApi.update(canvasId!, id, { x: el.x, y: el.y }).catch(console.error);
          collabClient.sendOperation('UPDATE_ELEMENT', { id, x: el.x, y: el.y });
        }
      });
      collabClient.sendSelection([...selectedIds]);
    }

    if (state.type === 'draw') {
      if (previewElement && state.moved) {
        const el = previewElement as CanvasElement;
        finishDraw({
          ...el,
          id: state.targetId || el.id || uid(),
        });
      }
      setPreviewElement(null);
    }

    if (state.type === 'connect') {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy, viewport);
      const hitId = hitTest(world.x, world.y);
      if (state.targetId && hitId && state.targetId !== hitId) {
        const zIndex = getMaxZIndex();
        const conn = {
          id: uid(),
          fromElementId: state.targetId,
          toElementId: hitId,
          fromPoint: 'auto',
          toPoint: 'auto',
          style: 'curve' as const,
          arrowStyle: 'end' as const,
          color: strokeColor,
          thickness: strokeWidth,
          waypoints: [],
          zIndex,
        };
        addConnection(conn);
        if (canvasId && canvasRole && canvasRole !== 'VIEWER' && canvasRole !== 'PUBLIC') {
          elementApi.createConnection(canvasId, conn).catch(console.error);
          collabClient.sendOperation('CREATE_CONNECTION', conn);
        }
      }
      setPreviewConnection(null);
      setCurrentTool('select');
    }

    dragStateRef.current = null;
  }, [setIsDragging, setIsDrawing, setSelectionBox, clearSelection, currentTool, viewport, hitTest, canvasRole, elements, canvasId, selectedIds, collabClient, previewElement, finishDraw, addConnection, strokeColor, strokeWidth, getMaxZIndex, setPreviewElement, setPreviewConnection, setCurrentTool]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldBefore = screenToWorld(sx, sy, viewport);
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = clamp(viewport.zoom * delta, MIN_ZOOM, MAX_ZOOM);
    if (newZoom === viewport.zoom) return;
    const newViewport = {
      x: worldBefore.x - sx / newZoom,
      y: worldBefore.y - sy / newZoom,
      zoom: newZoom,
    };
    setViewport(newViewport);
    debounce(() => {
      collabClient.sendViewport(newViewport.x, newViewport.y, newViewport.zoom);
    }, 500)();
    if (currentCanvas) {
      updateCanvasMeta({
        viewportX: newViewport.x,
        viewportY: newViewport.y,
        viewportZoom: newViewport.zoom,
      });
    }
  }, [viewport, setViewport, currentCanvas, updateCanvasMeta, collabClient]);

  const startEditing = useCallback((elementId: string) => {
    const el = elements.get(elementId);
    if (!el) return;
    const screen = worldToScreen(el.x, el.y, viewport);
    setEditingText({
      elementId,
      x: screen.x,
      y: screen.y,
      width: el.width * viewport.zoom,
      height: el.height * viewport.zoom,
      text: el.data.text || '',
      fontSize: (el.data.fontSize || 16) * viewport.zoom,
      color: el.data.color || el.data.strokeColor || '#0F172A',
      align: el.data.align || (el.type === 'text' ? 'left' : 'center'),
    });
  }, [elements, viewport]);

  const finishEditing = useCallback((newText: string) => {
    if (!editingText) return;
    const elementId = editingText.elementId;
    const el = elements.get(elementId);
    if (el) {
      updateElement(elementId, {
        data: { text: newText },
      });
      if (canvasId && canvasRole && canvasRole !== 'VIEWER' && canvasRole !== 'PUBLIC') {
        elementApi.update(canvasId, elementId, {
          data: { ...el.data, text: newText },
        }).catch(console.error);
        collabClient.sendOperation('UPDATE_ELEMENT', {
          id: elementId,
          data: { ...el.data, text: newText },
        });
      }
    }
    setEditingText(null);
    editingRef.current = null;
  }, [editingText, elements, updateElement, canvasId, canvasRole, collabClient]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy, viewport);
    const hitId = hitTest(world.x, world.y);
    if (hitId && elements.has(hitId)) {
      const el = elements.get(hitId)!;
      if (['text', 'sticky_note', 'mindnode', 'rectangle', 'circle', 'ellipse', 'diamond'].includes(el.type)) {
        startEditing(hitId);
      }
      return;
    }
    const isEditable = canvasRole && canvasRole !== 'VIEWER' && canvasRole !== 'PUBLIC';
    if (isEditable) {
      const el = createElement('text', world.x - 90, world.y - 20, {
        width: 180,
        height: 40,
      });
      finishDraw(el);
      setTimeout(() => startEditing(el.id), 50);
    }
  }, [viewport, hitTest, elements, startEditing, canvasRole, createElement, finishDraw]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.code === 'Space') {
        spacePressedRef.current = true;
        if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
        e.preventDefault();
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        const isEditable = canvasRole && canvasRole !== 'VIEWER' && canvasRole !== 'PUBLIC';
        if (isEditable) {
          const ids = [...selectedIds];
          ids.forEach(id => deleteElement(id));
          if (canvasId) {
            elementApi.batchDelete(canvasId, ids).catch(console.error);
            collabClient.sendOperation('BATCH_DELETE_ELEMENTS', { ids });
          }
          clearSelection();
          e.preventDefault();
        }
      }

      if ((e.key === 'Tab' || e.key === 'Enter') && selectedIds.size === 1 && useCanvasStore.getState().mindMapMode) {
        const [selectedId] = selectedIds;
        const parentEl = elements.get(selectedId);
        if (parentEl && parentEl.type === 'mindnode') {
          e.preventDefault();
          const level = (parentEl.data.mindMapLevel || 0) + 1;
          const childX = parentEl.x + parentEl.width + 80;
          const childY = parentEl.y;
          const child = createElement('mindnode', childX, childY, {
            parentId: parentEl.id,
            data: {
              text: '新节点',
              mindMapLevel: level,
              fillColor: level === 1 ? '#DBEAFE' : level === 2 ? '#DCFCE7' : '#F3E8FF',
              strokeColor: level === 1 ? '#3B82F6' : level === 2 ? '#10B981' : '#8B5CF6',
            },
          });
          finishDraw(child);
        }
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault();
        }
        if (e.key === 'y') {
          e.preventDefault();
        }
      }

      const toolMap: Record<string, Tool> = {
        v: 'select',
        h: 'pan',
        p: 'freehand',
        r: 'rectangle',
        o: 'circle',
        t: 'text',
        n: 'sticky_note',
        a: 'arrow',
        l: 'line',
      };
      if (toolMap[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setCurrentTool(toolMap[e.key]);
      }

      if (e.key === 'Escape') {
        clearSelection();
        setCurrentTool('select');
        setPreviewElement(null);
        setPreviewConnection(null);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePressedRef.current = false;
        if (canvasRef.current) canvasRef.current.style.cursor = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedIds, canvasRole, canvasId, elements, createElement, finishDraw, deleteElement, clearSelection, setCurrentTool, setPreviewElement, setPreviewConnection, collabClient]);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!canvasId) return;
      const isEditable = canvasRole && canvasRole !== 'VIEWER' && canvasRole !== 'PUBLIC';
      if (!isEditable) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const dataUrl = ev.target?.result as string;
              const img = new Image();
              img.onload = () => {
                const maxDim = 400;
                let w = img.width;
                let h = img.height;
                if (w > maxDim || h > maxDim) {
                  const scale = maxDim / Math.max(w, h);
                  w = w * scale;
                  h = h * scale;
                }
                const wx = viewport.x + (window.innerWidth / 2) / viewport.zoom - w / 2;
                const wy = viewport.y + (window.innerHeight / 2) / viewport.zoom - h / 2;
                const el = createElement('image', wx, wy, {
                  width: w,
                  height: h,
                  data: { imageData: dataUrl },
                });
                finishDraw(el);
              };
              img.src = dataUrl;
            };
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [canvasId, canvasRole, viewport, createElement, finishDraw]);

  useEffect(() => {
    const ids = [...selectedIds];
    collabClient.sendSelection(ids);
  }, [selectedIds, collabClient]);

  useEffect(() => {
    if (canvasId && canvasRole && canvasRole !== 'VIEWER' && canvasRole !== 'PUBLIC') {
      const token = localStorage.getItem('collab_token');
      collabClient.connect(canvasId, token).catch(console.error);
    }
    return () => {
      collabClient.disconnect();
    };
  }, [canvasId, canvasRole]);

  useEffect(() => {
    if (canvasId) {
      pluginManager.setCanvasId(canvasId);
      pluginManager.loadInstalledPluginsFromServer();
    }
    return () => {
      pluginManager.destroyAll();
    };
  }, [canvasId]);

  useEffect(() => {
    const ids = [...selectedIds];
    pluginManager.broadcastEvent('selection:changed', ids);
  }, [selectedIds]);

  useEffect(() => {
    pluginManager.broadcastEvent('viewport:changed', { ...viewport });
  }, [viewport.x, viewport.y, viewport.zoom]);

  useEffect(() => {
    const handleAdd = (el: CanvasElement) => {
      pluginManager.broadcastEvent('element:created', { ...el });
    };
    const handleUpdate = (id: string, updates: Partial<CanvasElement>) => {
      const el = useCanvasStore.getState().elements.get(id);
      if (el) {
        pluginManager.broadcastEvent('element:updated', { ...el });
      }
    };
    const handleDelete = (id: string) => {
      pluginManager.broadcastEvent('element:deleted', id);
    };

    const origAdd = useCanvasStore.getState().addElement;
    const origUpdate = useCanvasStore.getState().updateElement;
    const origDelete = useCanvasStore.getState().deleteElement;

    const unsub = useCanvasStore.subscribe((state, prevState) => {
      if (state.elements !== prevState.elements) {
        const prevKeys = new Set(prevState.elements.keys());
        const currKeys = new Set(state.elements.keys());
        for (const k of currKeys) {
          if (!prevKeys.has(k)) {
            const el = state.elements.get(k);
            if (el) handleAdd(el);
          } else {
            const prev = prevState.elements.get(k);
            const curr = state.elements.get(k);
            if (prev && curr && prev !== curr) {
              handleUpdate(k, curr as any);
            }
          }
        }
        for (const k of prevKeys) {
          if (!currKeys.has(k)) {
            handleDelete(k);
          }
        }
      }
    });

    return () => { unsub(); };
  }, []);

  useEffect(() => {
    const unsub = useCanvasStore.subscribe((state, prevState) => {
      if (state.onlineUsers !== prevState.onlineUsers) {
        const prevUserIds = new Set(prevState.onlineUsers.keys());
        const currUserIds = new Set(state.onlineUsers.keys());
        for (const uid of currUserIds) {
          if (!prevUserIds.has(uid)) {
            const user = state.onlineUsers.get(uid);
            if (user) pluginManager.broadcastEvent('user:joined', { ...user });
          }
        }
        for (const uid of prevUserIds) {
          if (!currUserIds.has(uid)) {
            pluginManager.broadcastEvent('user:left', uid);
          }
        }
      }
    });
    return () => { unsub(); };
  }, []);

  const zoomToFit = useCallback(() => {
    if (elements.size === 0) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    elements.forEach(el => {
      const bbox = getElementBBox(el);
      minX = Math.min(minX, bbox.minX);
      minY = Math.min(minY, bbox.minY);
      maxX = Math.max(maxX, bbox.maxX);
      maxY = Math.max(maxY, bbox.maxY);
    });
    const padding = 100;
    const w = maxX - minX + padding * 2;
    const h = maxY - minY + padding * 2;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const zoom = Math.min(rect.width / w, rect.height / h, 2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setViewport({
      x: cx - rect.width / 2 / zoom,
      y: cy - rect.height / 2 / zoom,
      zoom,
    });
  }, [elements, setViewport]);

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!canvasId) return;
    const isEditable = canvasRole && canvasRole !== 'VIEWER' && canvasRole !== 'PUBLIC';
    if (!isEditable) return;

    const files = Array.from(e.dataTransfer.files);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy, viewport);

    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          const img = new Image();
          img.onload = () => {
            const maxDim = 500;
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
              const scale = maxDim / Math.max(w, h);
              w = w * scale;
              h = h * scale;
            }
            const el = createElement('image', world.x - w / 2, world.y - h / 2, {
              width: w,
              height: h,
              data: { imageData: dataUrl },
            });
            finishDraw(el);
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      }
    });
  }, [canvasId, canvasRole, viewport, createElement, finishDraw]);

  const canEdit = canvasRole && canvasRole !== 'VIEWER' && canvasRole !== 'PUBLIC';
  const canComment = canvasRole && canvasRole !== 'VIEWER' && canvasRole !== 'PUBLIC';

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy, viewport);
    const hitId = hitTest(world.x, world.y);
    setContextMenu({ x: e.clientX, y: e.clientY, elementId: hitId });
  }, [viewport, hitTest]);

  const handleAddComment = useCallback(async () => {
    if (!contextMenu || !canvasId || !canComment) return;
    const elementId = contextMenu.elementId;
    try {
      let anchorX: number, anchorY: number;
      if (elementId) {
        const el = elements.get(elementId);
        if (el) {
          anchorX = el.x + el.width;
          anchorY = el.y;
        } else {
          if (!canvasRef.current) return;
          const rect = canvasRef.current.getBoundingClientRect();
          const sx = contextMenu.x - rect.left;
          const sy = contextMenu.y - rect.top;
          const world = screenToWorld(sx, sy, viewport);
          anchorX = world.x;
          anchorY = world.y;
        }
      } else {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const sx = contextMenu.x - rect.left;
        const sy = contextMenu.y - rect.top;
        const world = screenToWorld(sx, sy, viewport);
        anchorX = world.x;
        anchorY = world.y;
      }

      const data = await commentApi.create(canvasId, {
        anchorX,
        anchorY,
        attachedElementId: elementId || undefined,
      });
      addComment(data.comment);
      if (data.replies && data.replies.length > 0) {
        setCommentReplies(data.comment.id, data.replies);
      }
      setOpenCommentId(data.comment.id);
      setCurrentTool('select');
    } catch (e) {
      console.error('Failed to create comment', e);
    }
    setContextMenu(null);
  }, [contextMenu, canvasId, canComment, elements, viewport, addComment, setCommentReplies, setOpenCommentId, setCurrentTool]);

  const handleDeleteElement = useCallback(() => {
    if (!contextMenu?.elementId || !canEdit) return;
    const id = contextMenu.elementId;
    deleteElement(id);
    if (canvasId) {
      elementApi.batchDelete(canvasId, [id]).catch(console.error);
      collabClient.sendOperation('BATCH_DELETE_ELEMENTS', { ids: [id] });
    }
    clearSelection();
    setContextMenu(null);
  }, [contextMenu, canEdit, deleteElement, canvasId, clearSelection]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-slate-50"
      style={{ cursor: spacePressedRef.current ? 'grab' : (currentTool === 'pan' ? 'grab' : currentTool === 'select' ? 'default' : 'crosshair') }}
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={handleImageDrop}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{
          cursor: spacePressedRef.current ? 'grab' : (currentTool === 'pan' ? 'grab' : !canEdit ? 'default' : currentTool === 'select' ? 'default' : 'crosshair'),
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (dragStateRef.current?.type === 'pan') {
            dragStateRef.current = null;
            setIsDragging(false);
          }
        }}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />

      {editingText && (
        <textarea
          autoFocus
          defaultValue={editingText.text}
          onBlur={(e) => finishEditing(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              finishEditing(editingText.text);
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              finishEditing((e.target as HTMLTextAreaElement).value);
            }
          }}
          ref={(ref) => {
            if (ref && !editingRef.current) {
              editingRef.current = { elementId: editingText.elementId, input: ref };
              setTimeout(() => {
                ref.focus();
                ref.select();
              }, 10);
            }
          }}
          style={{
            position: 'absolute',
            left: editingText.x,
            top: editingText.y,
            width: editingText.width,
            height: Math.max(editingText.height, 40),
            padding: '12px',
            fontSize: editingText.fontSize,
            color: editingText.color,
            background: 'rgba(255,255,255,0.98)',
            border: '2px solid #4F46E5',
            borderRadius: 8,
            outline: 'none',
            resize: 'none',
            textAlign: editingText.align,
            zIndex: 100,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
            lineHeight: 1.3,
          }}
        />
      )}

      <MiniMap canvasRef={canvasRef} onZoomToFit={zoomToFit} />

      <CommentLayer />

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          />
          <div
            className="fixed z-[60] panel shadow-xl overflow-hidden py-1 min-w-[160px]"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              transformOrigin: 'top left',
            }}
          >
            {canComment && (
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-indigo-50 transition-colors text-sm text-slate-700"
                onClick={handleAddComment}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {contextMenu.elementId ? '添加评论' : '添加评论'}
              </button>
            )}
            {contextMenu.elementId && canEdit && (
              <div className="border-t border-slate-100 my-1" />
            )}
            {contextMenu.elementId && canEdit && (
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-red-50 transition-colors text-sm text-red-600"
                onClick={handleDeleteElement}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                </svg>
                删除元素
              </button>
            )}
          </div>
        </>
      )}

      <div className="absolute bottom-4 left-4 toolbar gap-2">
        <button
          className="btn btn-icon btn-sm"
          onClick={() => {
            const newZoom = clamp(viewport.zoom * 0.9, MIN_ZOOM, MAX_ZOOM);
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
              const cx = rect.width / 2;
              const cy = rect.height / 2;
              const world = screenToWorld(cx, cy, viewport);
              setViewport({
                zoom: newZoom,
                x: world.x - cx / newZoom,
                y: world.y - cy / newZoom,
              });
            }
          }}
          title="缩小"
        >
          −
        </button>
        <span className="text-sm font-medium text-slate-700 min-w-[60px] text-center">
          {Math.round(viewport.zoom * 100)}%
        </span>
        <button
          className="btn btn-icon btn-sm"
          onClick={() => {
            const newZoom = clamp(viewport.zoom * 1.1, MIN_ZOOM, MAX_ZOOM);
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
              const cx = rect.width / 2;
              const cy = rect.height / 2;
              const world = screenToWorld(cx, cy, viewport);
              setViewport({
                zoom: newZoom,
                x: world.x - cx / newZoom,
                y: world.y - cy / newZoom,
              });
            }
          }}
          title="放大"
        >
          +
        </button>
        <div className="divider" />
        <button
          className="btn btn-icon btn-sm"
          onClick={zoomToFit}
          title="适应画布"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/></svg>
        </button>
        <button
          className="btn btn-icon btn-sm"
          onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
          title="重置视图"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8l3 3M5 19l3-3m8-8l3-3"/></svg>
        </button>
      </div>
    </div>
  );
};

export default CanvasBoard;
