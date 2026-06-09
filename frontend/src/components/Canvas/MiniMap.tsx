import React, { useRef, useEffect, useCallback } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasElement } from '@/types';
import { getElementBBox } from '@/utils';
import { screenToWorld, worldToScreen } from '@/canvas/geometry';

interface MiniMapProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onZoomToFit: () => void;
}

const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 150;
const PADDING = 20;

const MiniMap: React.FC<MiniMapProps> = ({ canvasRef, onZoomToFit }) => {
  const miniMapRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);

  const { elements, viewport, setViewport, currentCanvas } = useCanvasStore();

  const getBounds = useCallback(() => {
    const els = [...elements.values()].filter(el => el.visible !== false);
    if (els.length === 0) {
      return { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    els.forEach(el => {
      const bbox = getElementBBox(el);
      minX = Math.min(minX, bbox.minX);
      minY = Math.min(minY, bbox.minY);
      maxX = Math.max(maxX, bbox.maxX);
      maxY = Math.max(maxY, bbox.maxY);
    });
    const pad = Math.max((maxX - minX), (maxY - minY)) * 0.1 + 200;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }, [elements]);

  const worldToMini = useCallback((wx: number, wy: number, bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
    const worldW = bounds.maxX - bounds.minX;
    const worldH = bounds.maxY - bounds.minY;
    const scale = Math.min(MINIMAP_WIDTH / worldW, MINIMAP_HEIGHT / worldH);
    const offsetX = (MINIMAP_WIDTH - worldW * scale) / 2;
    const offsetY = (MINIMAP_HEIGHT - worldH * scale) / 2;
    return {
      x: (wx - bounds.minX) * scale + offsetX,
      y: (wy - bounds.minY) * scale + offsetY,
      scale,
    };
  }, []);

  const miniToWorld = useCallback((mx: number, my: number, bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
    const worldW = bounds.maxX - bounds.minX;
    const worldH = bounds.maxY - bounds.minY;
    const scale = Math.min(MINIMAP_WIDTH / worldW, MINIMAP_HEIGHT / worldH);
    const offsetX = (MINIMAP_WIDTH - worldW * scale) / 2;
    const offsetY = (MINIMAP_HEIGHT - worldH * scale) / 2;
    return {
      x: (mx - offsetX) / scale + bounds.minX,
      y: (my - offsetY) / scale + bounds.minY,
    };
  }, []);

  useEffect(() => {
    const canvas = miniMapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = MINIMAP_WIDTH * dpr;
    canvas.height = MINIMAP_HEIGHT * dpr;
    canvas.style.width = `${MINIMAP_WIDTH}px`;
    canvas.style.height = `${MINIMAP_HEIGHT}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    const bounds = getBounds();
    const bgColor = currentCanvas?.canvas.backgroundColor || '#FFFFFF';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    const sortedEls = [...elements.values()]
      .filter(el => el.visible !== false)
      .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    sortedEls.forEach((el: CanvasElement) => {
      const tl = worldToMini(el.x, el.y, bounds);
      const br = worldToMini(el.x + el.width, el.y + el.height, bounds);
      const w = br.x - tl.x;
      const h = br.y - tl.y;

      const fillColor = el.data.noteColor || el.data.fillColor;
      const strokeColor = el.data.strokeColor || '#0F172A';

      if (fillColor && fillColor !== 'transparent') {
        ctx.fillStyle = fillColor;
        ctx.fillRect(tl.x, tl.y, Math.max(1, w), Math.max(1, h));
      }
      if (el.type === 'freehand' && el.data.points) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(0.5, (el.data.strokeWidth || 2) * tl.scale);
        ctx.lineCap = 'round';
        ctx.beginPath();
        el.data.points.forEach((pt: { x: number; y: number }, i: number) => {
          const p = worldToMini(el.x + pt.x, el.y + pt.y, bounds);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      } else {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(0.5, (el.data.strokeWidth || 1) * tl.scale);
        ctx.strokeRect(tl.x, tl.y, Math.max(1, w), Math.max(1, h));
      }
    });

    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const vpTl = worldToMini(viewport.x, viewport.y, bounds);
      const vpBr = worldToMini(viewport.x + rect.width / viewport.zoom, viewport.y + rect.height / viewport.zoom, bounds);
      const vpW = vpBr.x - vpTl.x;
      const vpH = vpBr.y - vpTl.y;

      ctx.fillStyle = 'rgba(79, 70, 229, 0.15)';
      ctx.fillRect(vpTl.x, vpTl.y, vpW, vpH);

      ctx.strokeStyle = '#4F46E5';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(vpTl.x, vpTl.y, vpW, vpH);
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, MINIMAP_WIDTH - 1, MINIMAP_HEIGHT - 1);

  }, [elements, viewport, currentCanvas, getBounds, worldToMini, canvasRef]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    updateViewport(e);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    updateViewport(e);
  };

  const handleMouseUp = () => {
    draggingRef.current = false;
  };

  const updateViewport = (e: React.MouseEvent) => {
    const canvas = miniMapRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const bounds = getBounds();
    const world = miniToWorld(mx, my, bounds);
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    setViewport({
      x: world.x - canvasRect.width / 2 / viewport.zoom,
      y: world.y - canvasRect.height / 2 / viewport.zoom,
    });
  };

  return (
    <div className="absolute bottom-4 right-4 panel p-2 select-none" style={{ width: MINIMAP_WIDTH + 16 }}>
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs font-medium text-slate-500">小地图</span>
        <button
          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
          onClick={(e) => { e.stopPropagation(); onZoomToFit(); }}
        >
          适应
        </button>
      </div>
      <canvas
        ref={miniMapRef}
        className="rounded-md cursor-crosshair block"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
};

export default MiniMap;
