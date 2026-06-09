import React, { useMemo } from 'react';
import type { CanvasElement, CanvasConnection } from '@/types';
import { useCanvasStore } from '@/store/canvasStore';
import { worldToScreen, getElementConnectionPoint, CONNECTION_POINTS } from '@/canvas/geometry';
import type { ConnectionPoint } from '@/canvas/geometry';
import { uid } from '@/utils';
import { collabClient } from '@/collaboration/CollabClient';
import { elementApi } from '@/api/client';

export interface ConnectPointsProps {
  elements: CanvasElement[];
  viewport: { x: number; y: number; zoom: number };
  onStartConnection?: (fromId: string, fromPoint: string) => void;
}

interface PointData {
  element: CanvasElement;
  point: ConnectionPoint;
  worldX: number;
  worldY: number;
  screenX: number;
  screenY: number;
}

export const ConnectPoints: React.FC<ConnectPointsProps> = ({
  elements,
  viewport,
  onStartConnection,
}) => {
  const store = useCanvasStore;
  const currentCanvas = store(s => s.currentCanvas);
  const previewConnection = store(s => s.previewConnection);
  const allElements = store(s => s.elements);
  const strokeColor = store(s => s.strokeColor);
  const strokeWidth = store(s => s.strokeWidth);
  const connections = store(s => s.connections);

  const canvasId = currentCanvas?.canvas.id;

  const pointsData = useMemo<PointData[]>(() => {
    const result: PointData[] = [];
    elements.forEach(el => {
      CONNECTION_POINTS.forEach(point => {
        const world = getElementConnectionPoint(el, point);
        const screen = worldToScreen(world.x, world.y, viewport);
        result.push({
          element: el,
          point,
          worldX: world.x,
          worldY: world.y,
          screenX: screen.x,
          screenY: screen.y,
        });
      });
    });
    return result;
  }, [elements, viewport]);

  const handleMouseDown = useMemo(() => (e: React.MouseEvent, pd: PointData) => {
    e.stopPropagation();
    e.preventDefault();
    if (pd.element.locked) return;
    onStartConnection?.(pd.element.id, pd.point);
  }, [onStartConnection]);

  const handleMouseUp = useMemo(() => (e: React.MouseEvent, pd: PointData) => {
    e.stopPropagation();
    e.preventDefault();
    const state = store.getState();
    if (!state.previewConnection) return;

    const fromId = state.previewConnection.fromId;
    const toId = pd.element.id;
    if (fromId === toId) {
      store.getState().setPreviewConnection(null);
      return;
    }

    const maxZ = Math.max(0, ...Array.from(state.connections.values()).map(c => c.zIndex || 0));
    const conn: CanvasConnection = {
      id: uid(),
      canvasId,
      fromElementId: fromId,
      toElementId: toId,
      fromPoint: state.previewConnection.fromPoint,
      toPoint: pd.point,
      style: 'curve',
      arrowStyle: 'end',
      color: strokeColor,
      thickness: strokeWidth,
      waypoints: [],
      zIndex: maxZ + 1,
    };

    state.addConnection(conn);
    state.setPreviewConnection(null);

    if (collabClient.isConnected()) {
      collabClient.sendOperation('CREATE_CONNECTION', conn);
    } else if (canvasId) {
      elementApi.createConnection(canvasId, conn).catch(console.error);
    }
  }, [canvasId, strokeColor, strokeWidth, store]);

  const handlePointDrag = useMemo(() => (
    e: React.MouseEvent,
    fromEl: CanvasElement,
    fromPoint: ConnectionPoint,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (fromEl.locked) return;

    const startScreen = { x: e.clientX, y: e.clientY };
    const startWorld = getElementConnectionPoint(fromEl, fromPoint);
    let targetEl: CanvasElement | null = null;
    let targetPoint: ConnectionPoint | null = null;
    let lastWorldX = startWorld.x;
    let lastWorldY = startWorld.y;

    const onMove = (ev: MouseEvent) => {
      const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect?.();
      const sx = ev.clientX - (rect?.left || 0);
      const sy = ev.clientY - (rect?.top || 0);
      const world = {
        x: sx / viewport.zoom + viewport.x,
        y: sy / viewport.zoom + viewport.y,
      };
      lastWorldX = world.x;
      lastWorldY = world.y;

      store.getState().setPreviewConnection({
        fromId: fromEl.id,
        fromPoint,
        toX: world.x,
        toY: world.y,
      });

      const hitRef: { current: { el: CanvasElement; pt: ConnectionPoint; dist: number } | null } = { current: null };
      allElements.forEach(el => {
        if (el.id === fromEl.id || el.locked) return;
        CONNECTION_POINTS.forEach(cp => {
          const wp = getElementConnectionPoint(el, cp);
          const d = Math.sqrt((wp.x - world.x) ** 2 + (wp.y - world.y) ** 2);
          const threshold = 16 / viewport.zoom;
          if (d < threshold && (!hitRef.current || d < hitRef.current.dist)) {
            hitRef.current = { el, pt: cp, dist: d };
          }
        });
      });
      targetEl = hitRef.current?.el || null;
      targetPoint = hitRef.current?.pt || null;
    };

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      const state = store.getState();
      if (targetEl && targetPoint && targetEl.id !== fromEl.id) {
        const maxZ = Math.max(0, ...Array.from(state.connections.values()).map(c => c.zIndex || 0));
        const conn: CanvasConnection = {
          id: uid(),
          canvasId,
          fromElementId: fromEl.id,
          toElementId: targetEl.id,
          fromPoint,
          toPoint: targetPoint,
          style: 'curve',
          arrowStyle: 'end',
          color: strokeColor,
          thickness: strokeWidth,
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
      state.setPreviewConnection(null);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    store.getState().setPreviewConnection({
      fromId: fromEl.id,
      fromPoint,
      toX: startWorld.x,
      toY: startWorld.y,
    });
  }, [allElements, canvasId, strokeColor, strokeWidth, store, viewport.zoom, viewport.x, viewport.y]);

  const previewLine = useMemo(() => {
    if (!previewConnection) return null;
    const fromEl = allElements.get(previewConnection.fromId);
    if (!fromEl) return null;

    const fromWorld = getElementConnectionPoint(fromEl, previewConnection.fromPoint as ConnectionPoint);
    const fromScreen = worldToScreen(fromWorld.x, fromWorld.y, viewport);
    const toScreen = worldToScreen(previewConnection.toX, previewConnection.toY, viewport);

    const dx = toScreen.x - fromScreen.x;
    const dy = toScreen.y - fromScreen.y;
    const angle = Math.atan2(dy, dx);
    const len = Math.sqrt(dx * dx + dy * dy);

    return (
      <svg
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 9998,
        }}
      >
        <defs>
          <marker
            id="conn-preview-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={strokeColor} />
          </marker>
        </defs>
        <line
          x1={fromScreen.x}
          y1={fromScreen.y}
          x2={toScreen.x}
          y2={toScreen.y}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray="8 4"
          markerEnd="url(#conn-preview-arrow)"
        />
      </svg>
    );
  }, [previewConnection, allElements, viewport, strokeColor, strokeWidth]);

  const pointSize = Math.max(10, 12 * Math.min(viewport.zoom, 1.5));

  return (
    <>
      {previewLine}

      {pointsData.map((pd) => {
        const isHoverTarget = previewConnection && pd.element.id !== previewConnection.fromId;
        return (
          <div
            key={`${pd.element.id}-${pd.point}`}
            onMouseDown={(e) => handlePointDrag(e, pd.element, pd.point)}
            onMouseUp={(e) => handleMouseUp(e, pd)}
            style={{
              position: 'absolute',
              left: `${pd.screenX - pointSize / 2}px`,
              top: `${pd.screenY - pointSize / 2}px`,
              width: `${pointSize}px`,
              height: `${pointSize}px`,
              borderRadius: '50%',
              background: isHoverTarget ? '#10B981' : '#FFFFFF',
              border: `2px solid ${isHoverTarget ? '#10B981' : '#6366F1'}`,
              cursor: pd.element.locked ? 'not-allowed' : 'crosshair',
              zIndex: 9999,
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            }}
          />
        );
      })}
    </>
  );
};

export default ConnectPoints;
