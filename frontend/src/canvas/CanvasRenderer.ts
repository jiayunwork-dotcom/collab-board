import type { CanvasElement, Viewport, CanvasConnection } from '@/types';
import { getConnectionPath, drawArrowhead, elementInViewport } from './geometry';
import { catmullRom } from '@/utils';

export interface RenderOptions {
  viewport: Viewport;
  showGrid?: boolean;
  showSelectionHandles?: boolean;
  hoveredId?: string;
}

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private dpr: number;

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width * this.dpr, this.height * this.dpr);
  }

  drawBackground(options: RenderOptions, bgType: string, bgColor: string, gridSize: number) {
    const { viewport } = options;
    this.ctx.save();
    this.ctx.fillStyle = bgColor || '#FFFFFF';
    this.ctx.fillRect(0, 0, this.width * this.dpr, this.height * this.dpr);

    if (bgType === 'SOLID' || !options.showGrid) {
      this.ctx.restore();
      return;
    }

    const zoom = viewport.zoom;
    const adjGridSize = gridSize * (gridSize * zoom < 8 ? 5 : 1);

    this.ctx.scale(this.dpr, this.dpr);
    this.ctx.translate(-viewport.x * zoom, -viewport.y * zoom);

    const startX = Math.floor(viewport.x / adjGridSize) * adjGridSize;
    const startY = Math.floor(viewport.y / adjGridSize) * adjGridSize;
    const endX = startX + this.width / zoom + adjGridSize * 2;
    const endY = startY + this.height / zoom + adjGridSize * 2;

    if (bgType === 'GRID_DOTS') {
      this.ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      const dotSize = Math.max(1, Math.min(2, zoom));
      for (let x = startX; x < endX; x += adjGridSize) {
        for (let y = startY; y < endY; y += adjGridSize) {
          this.ctx.beginPath();
          this.ctx.arc(x, y, dotSize, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
    } else if (bgType === 'GRID_LINES') {
      this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
      this.ctx.lineWidth = 1 / zoom;
      for (let x = startX; x < endX; x += adjGridSize) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, startY);
        this.ctx.lineTo(x, endY);
        this.ctx.stroke();
      }
      for (let y = startY; y < endY; y += adjGridSize) {
        this.ctx.beginPath();
        this.ctx.moveTo(startX, y);
        this.ctx.lineTo(endX, y);
        this.ctx.stroke();
      }

      this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      const majorGrid = adjGridSize * 5;
      const majorStartX = Math.floor(viewport.x / majorGrid) * majorGrid;
      const majorStartY = Math.floor(viewport.y / majorGrid) * majorGrid;
      const majorEndX = majorStartX + this.width / zoom + majorGrid * 2;
      const majorEndY = majorStartY + this.height / zoom + majorGrid * 2;
      for (let x = majorStartX; x < majorEndX; x += majorGrid) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, majorStartY);
        this.ctx.lineTo(x, majorEndY);
        this.ctx.stroke();
      }
      for (let y = majorStartY; y < majorEndY; y += majorGrid) {
        this.ctx.beginPath();
        this.ctx.moveTo(majorStartX, y);
        this.ctx.lineTo(majorEndX, y);
        this.ctx.stroke();
      }
    }

    this.ctx.restore();
  }

  drawElements(elements: CanvasElement[], options: RenderOptions) {
    const sorted = [...elements]
      .filter(el => el.visible !== false && elementInViewport(el, options.viewport))
      .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    this.ctx.save();
    this.ctx.scale(this.dpr, this.dpr);
    const { zoom } = options.viewport;
    this.ctx.translate(-options.viewport.x * zoom, -options.viewport.y * zoom);

    sorted.forEach(el => {
      try {
        this.drawElement(el, options);
      } catch (e) {
        console.error('Error drawing element', el.id, e);
      }
    });

    this.ctx.restore();
  }

  drawElement(el: CanvasElement, options: RenderOptions) {
    const ctx = this.ctx;
    const data = el.data || {};
    const opacity = el.opacity ?? 1;
    const rotation = el.rotation ?? 0;

    ctx.save();
    ctx.globalAlpha = opacity;

    if (rotation) {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    const strokeColor = data.strokeColor || '#0F172A';
    const strokeWidth = data.strokeWidth || 2;
    const fillColor = data.fillColor || 'transparent';

    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = strokeColor;
    if (fillColor && fillColor !== 'transparent') {
      ctx.fillStyle = fillColor;
    }

    switch (el.type) {
      case 'rectangle':
      case 'sticky_note':
        this.drawRect(el, data, fillColor, strokeColor, strokeWidth);
        break;
      case 'circle':
      case 'ellipse':
        this.drawEllipse(el, data, fillColor, strokeColor, strokeWidth);
        break;
      case 'diamond':
        this.drawDiamond(el, fillColor, strokeColor, strokeWidth);
        break;
      case 'mindnode':
        this.drawMindNode(el, data, fillColor, strokeColor, strokeWidth);
        break;
      case 'line':
      case 'arrow':
        this.drawLineOrArrow(el, data);
        break;
      case 'freehand':
        this.drawFreehand(el, data);
        break;
      case 'polygon':
        this.drawPolygon(el, data, fillColor, strokeColor, strokeWidth);
        break;
      case 'text':
        this.drawText(el, data);
        break;
      case 'image':
        this.drawImage(el, data);
        break;
      default:
        this.drawRect(el, data, fillColor, strokeColor, strokeWidth);
    }

    ctx.restore();
  }

  private drawRect(el: CanvasElement, data: any, fill: string, stroke: string, sw: number) {
    const ctx = this.ctx;
    const radius = el.type === 'sticky_note' ? 4 : (data.borderRadius || 8);

    const x = el.x, y = el.y, w = el.width, h = el.height;
    if (radius > 0) {
      const r = Math.min(radius, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    } else {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
    }

    const noteFill = data.noteColor || fill || '#FEF3C7';
    if (el.type === 'sticky_note' || (noteFill && noteFill !== 'transparent')) {
      ctx.fillStyle = el.type === 'sticky_note' ? noteFill : fill;
      ctx.fill();
    } else if (fill !== 'transparent') {
      ctx.fill();
    }
    if (sw > 0) {
      const borderStroke = data.strokeColor || stroke;
      if (el.type === 'sticky_note') {
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      } else {
        ctx.strokeStyle = borderStroke;
      }
      ctx.lineWidth = sw;
      ctx.stroke();
    }

    if (data.text) {
      this.drawTextInside(el, data);
    }
  }

  private drawEllipse(el: CanvasElement, data: any, fill: string, stroke: string, sw: number) {
    const ctx = this.ctx;
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const rx = el.type === 'circle'
      ? Math.min(el.width, el.height) / 2
      : el.width / 2;
    const ry = el.type === 'circle'
      ? Math.min(el.width, el.height) / 2
      : el.height / 2;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (fill !== 'transparent') {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (sw > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = sw;
      ctx.stroke();
    }
    if (data.text) {
      this.drawTextInside(el, data);
    }
  }

  private drawDiamond(el: CanvasElement, fill: string, stroke: string, sw: number) {
    const ctx = this.ctx;
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const hw = el.width / 2;
    const hh = el.height / 2;

    ctx.beginPath();
    ctx.moveTo(cx, el.y);
    ctx.lineTo(el.x + el.width, cy);
    ctx.lineTo(cx, el.y + el.height);
    ctx.lineTo(el.x, cy);
    ctx.closePath();

    if (fill !== 'transparent') {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (sw > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = sw;
      ctx.stroke();
    }
  }

  private drawMindNode(el: CanvasElement, data: any, fill: string, stroke: string, sw: number) {
    const shape = data.shape || 'rounded';
    const customFill = data.fillColor || fill || '#EFF6FF';
    const customStroke = data.strokeColor || stroke || '#2563EB';

    if (shape === 'ellipse') {
      this.drawEllipse(el, { ...data, fillColor: customFill, strokeColor: customStroke }, customFill, customStroke, sw || 2);
    } else if (shape === 'diamond') {
      this.drawDiamond(el, customFill, customStroke, sw || 2);
    } else {
      this.drawRect(el, {
        ...data,
        borderRadius: shape === 'rectangle' ? 4 : 12,
        fillColor: customFill,
        strokeColor: customStroke,
      }, customFill, customStroke, sw || 2);
    }

    if (data.collapsible !== false) {
      this.drawCollapseHandle(el, !!data.collapsed);
    }
  }

  private drawCollapseHandle(el: CanvasElement, collapsed: boolean) {
    const ctx = this.ctx;
    const hx = el.x + el.width - 8;
    const hy = el.y + el.height / 2;
    const size = 16;

    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#6366F1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hx, hy, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#6366F1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx - 4, hy);
    ctx.lineTo(hx + 4, hy);
    if (collapsed) {
      ctx.moveTo(hx, hy - 4);
      ctx.lineTo(hx, hy + 4);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawLineOrArrow(el: CanvasElement, data: any) {
    const ctx = this.ctx;
    const points = data.points || [{ x: el.x, y: el.y }, { x: el.x + el.width, y: el.y + el.height }];

    ctx.strokeStyle = data.strokeColor || '#0F172A';
    ctx.lineWidth = data.strokeWidth || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const start = points[0];
    const end = points[points.length - 1];

    let pts = points;
    if (el.type === 'arrow' && points.length === 2) {
      pts = catmullRom(points, 0.3);
    }

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    if (el.type === 'arrow' || data.arrowStart || data.arrowEnd) {
      const color = data.strokeColor || '#0F172A';
      if (data.arrowEnd !== false) {
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        drawArrowhead(ctx, end.x, end.y, angle, color, 10);
      }
      if (data.arrowStart) {
        const angle = Math.atan2(start.y - end.y, start.x - end.x);
        drawArrowhead(ctx, start.x, start.y, angle, color, 10);
      }
    }
  }

  private drawFreehand(el: CanvasElement, data: any) {
    const ctx = this.ctx;
    const points = data.points || [];
    if (points.length < 2) return;

    ctx.strokeStyle = data.strokeColor || '#0F172A';
    ctx.lineWidth = data.strokeWidth || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = (el.opacity ?? 1) * (data.opacity ?? 1);

    const smoothed = catmullRom(points, 0.5);

    ctx.beginPath();
    ctx.moveTo(smoothed[0].x, smoothed[0].y);
    for (let i = 1; i < smoothed.length; i++) {
      ctx.lineTo(smoothed[i].x, smoothed[i].y);
    }
    ctx.stroke();
  }

  private drawPolygon(el: CanvasElement, data: any, fill: string, stroke: string, sw: number) {
    const ctx = this.ctx;
    const points = data.points || [];
    if (points.length < 3) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();

    if (fill !== 'transparent') {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (sw > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = sw;
      ctx.stroke();
    }
  }

  private drawText(el: CanvasElement, data: any) {
    this.drawTextInside(el, {
      ...data,
      fillColor: 'transparent',
      strokeWidth: 0,
    });
  }

  private drawTextInside(el: CanvasElement, data: any) {
    const ctx = this.ctx;
    const text = data.text || '';
    if (!text) return;

    const fontSize = data.fontSize || 16;
    const color = data.color || data.strokeColor || '#0F172A';
    const align = data.align || (el.type === 'text' ? 'left' : 'center');

    const padX = 12;
    const padY = 8;
    const textW = el.width - padX * 2;
    const textH = el.height - padY * 2;

    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `${data.italic ? 'italic ' : ''}${data.bold ? 'bold ' : ''}${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';

    let startX = el.x + padX;
    if (align === 'center') startX = el.x + el.width / 2;
    if (align === 'right') startX = el.x + el.width - padX;

    const lines = this.wrapText(text, textW);
    const lineHeight = fontSize * 1.3;
    const totalHeight = lines.length * lineHeight;
    let startY = el.y + padY;

    if (totalHeight < textH) {
      startY += (textH - totalHeight) / 2;
    }

    lines.forEach((line, i) => {
      if (data.underline) {
        const metrics = ctx.measureText(line);
        const lineW = metrics.width;
        let ux = startX;
        if (align === 'center') ux = startX - lineW / 2;
        if (align === 'right') ux = startX - lineW;
        const uy = startY + i * lineHeight + fontSize * 1.1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ux, uy);
        ctx.lineTo(ux + lineW, uy);
        ctx.stroke();
      }
      ctx.fillText(line, startX, startY + i * lineHeight);
    });

    ctx.restore();
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const ctx = this.ctx;
    const lines: string[] = [];
    const rawLines = text.split('\n');

    for (const raw of rawLines) {
      const chars = [...raw];
      let current = '';
      for (const ch of chars) {
        const test = current + ch;
        if (ctx.measureText(test).width > maxWidth && current) {
          lines.push(current);
          current = ch;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);
    }
    return lines.length ? lines : [''];
  }

  private drawImage(el: CanvasElement, data: any) {
    const ctx = this.ctx;
    if (!data._cachedImg && (data.imageData || data.imageUrl)) {
      const src = data.imageData || data.imageUrl;
      const img = new Image();
      img.onload = () => {
        data._cachedImg = img;
      };
      img.crossOrigin = 'anonymous';
      img.src = src;
      data._cachedImg = null;
    }
    if (data._cachedImg) {
      ctx.drawImage(data._cachedImg, el.x, el.y, el.width, el.height);
    } else {
      ctx.fillStyle = '#F3F4F6';
      ctx.fillRect(el.x, el.y, el.width, el.height);
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('图片加载中...', el.x + el.width / 2, el.y + el.height / 2);
    }
  }

  drawConnections(
    connections: CanvasConnection[],
    elements: Map<string, CanvasElement>,
    options: RenderOptions
  ) {
    const sorted = [...connections].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    this.ctx.save();
    this.ctx.scale(this.dpr, this.dpr);
    const { zoom } = options.viewport;
    this.ctx.translate(-options.viewport.x * zoom, -options.viewport.y * zoom);

    sorted.forEach(conn => {
      const fromEl = elements.get(conn.fromElementId);
      const toEl = elements.get(conn.toElementId);
      if (!fromEl || !toEl) return;

      try {
        const { path, from, to, midpoint } = getConnectionPath(conn, fromEl, toEl);

        this.ctx.strokeStyle = conn.color;
        this.ctx.lineWidth = conn.thickness || 2;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        const p = new Path2D(path);
        this.ctx.stroke(p);

        if (conn.arrowStyle !== 'none') {
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const angle = Math.atan2(dy, dx);
          if (conn.arrowStyle === 'end' || conn.arrowStyle === 'both') {
            drawArrowhead(this.ctx, to.x, to.y, angle, conn.color, 10);
          }
          if (conn.arrowStyle === 'start' || conn.arrowStyle === 'both') {
            drawArrowhead(this.ctx, from.x, from.y, angle + Math.PI, conn.color, 10);
          }
        }

        if (conn.label) {
          const fontSize = 13;
          const padding = 6;
          this.ctx.font = `${fontSize}px sans-serif`;
          const metrics = this.ctx.measureText(conn.label);
          const tw = metrics.width + padding * 2;
          const th = fontSize + padding;

          this.ctx.fillStyle = '#FFFFFF';
          this.ctx.strokeStyle = '#E2E8F0';
          this.ctx.lineWidth = 1;
          this.ctx.fillRect(midpoint.x - tw / 2, midpoint.y - th / 2, tw, th);
          this.ctx.strokeRect(midpoint.x - tw / 2, midpoint.y - th / 2, tw, th);
          this.ctx.fillStyle = '#334155';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(conn.label, midpoint.x, midpoint.y);
        }
      } catch (e) {
        console.error('Draw connection error', e);
      }
    });

    this.ctx.restore();
  }

  drawSelection(
    selectedIds: Set<string>,
    elements: CanvasElement[],
    options: RenderOptions
  ) {
    if (selectedIds.size === 0) return;

    this.ctx.save();
    this.ctx.scale(this.dpr, this.dpr);
    const { zoom } = options.viewport;
    this.ctx.translate(-options.viewport.x * zoom, -options.viewport.y * zoom);

    selectedIds.forEach(id => {
      const el = elements.find(e => e.id === id);
      if (!el) return;

      this.ctx.strokeStyle = '#4F46E5';
      this.ctx.lineWidth = 2 / zoom;
      this.ctx.setLineDash([6 / zoom, 4 / zoom]);

      const pad = 4;
      this.ctx.strokeRect(el.x - pad, el.y - pad, el.width + pad * 2, el.height + pad * 2);

      this.ctx.setLineDash([]);
      this.ctx.fillStyle = '#4F46E5';

      const handles = [
        { x: el.x, y: el.y },
        { x: el.x + el.width / 2, y: el.y },
        { x: el.x + el.width, y: el.y },
        { x: el.x + el.width, y: el.y + el.height / 2 },
        { x: el.x + el.width, y: el.y + el.height },
        { x: el.x + el.width / 2, y: el.y + el.height },
        { x: el.x, y: el.y + el.height },
        { x: el.x, y: el.y + el.height / 2 },
      ];
      const hs = 6 / zoom;
      handles.forEach(h => {
        this.ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
      });
    });

    this.ctx.restore();
  }

  drawRemoteSelections(
    remoteSels: Map<string, string[]>,
    onlineUsers: Map<string, any>,
    elements: CanvasElement[],
    options: RenderOptions
  ) {
    this.ctx.save();
    this.ctx.scale(this.dpr, this.dpr);
    const { zoom } = options.viewport;
    this.ctx.translate(-options.viewport.x * zoom, -options.viewport.y * zoom);

    remoteSels.forEach((ids, uid) => {
      if (ids.length === 0) return;
      const user = onlineUsers.get(uid);
      const color = user?.color || '#6B7280';
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 2 / zoom;
      this.ctx.setLineDash([4 / zoom, 4 / zoom]);

      ids.forEach(id => {
        const el = elements.find(e => e.id === id);
        if (!el) return;
        const pad = 3;
        this.ctx.strokeRect(el.x - pad, el.y - pad, el.width + pad * 2, el.height + pad * 2);
      });
      this.ctx.setLineDash([]);
    });

    this.ctx.restore();
  }

  drawRemoteCursors(
    cursors: Map<string, { x: number; y: number; ts: number }>,
    onlineUsers: Map<string, any>,
    options: RenderOptions
  ) {
    this.ctx.save();
    this.ctx.scale(this.dpr, this.dpr);
    const { zoom } = options.viewport;
    this.ctx.translate(-options.viewport.x * zoom, -options.viewport.y * zoom);

    const now = Date.now();
    cursors.forEach((cur, uid) => {
      if (now - cur.ts > 10000) return;
      const user = onlineUsers.get(uid);
      const color = user?.color || '#6B7280';
      const name = user?.username || 'User';

      const { x, y } = cur;

      this.ctx.fillStyle = color;
      this.ctx.strokeStyle = '#FFFFFF';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x, y + 14);
      this.ctx.lineTo(x + 4, y + 10);
      this.ctx.lineTo(x + 8, y + 16);
      this.ctx.lineTo(x + 10, y + 15);
      this.ctx.lineTo(x + 6, y + 9);
      this.ctx.lineTo(x + 11, y + 8);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();

      const fontSize = 11;
      this.ctx.font = `${fontSize}px sans-serif`;
      const metrics = this.ctx.measureText(name);
      const pad = 5;
      const tx = x + 14;
      const ty = y;
      this.ctx.fillStyle = color;
      this.ctx.fillRect(tx, ty, metrics.width + pad * 2, fontSize + pad * 2);
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(name, tx + pad, ty + (fontSize + pad * 2) / 2);
    });

    this.ctx.restore();
  }

  drawSelectionBox(box: { x: number; y: number; w: number; h: number } | null, options: RenderOptions) {
    if (!box) return;
    this.ctx.save();
    this.ctx.scale(this.dpr, this.dpr);
    const { zoom } = options.viewport;
    this.ctx.translate(-options.viewport.x * zoom, -options.viewport.y * zoom);

    this.ctx.fillStyle = 'rgba(79, 70, 229, 0.1)';
    this.ctx.strokeStyle = '#4F46E5';
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([6, 4]);
    const x = box.w >= 0 ? box.x : box.x + box.w;
    const y = box.h >= 0 ? box.y : box.y + box.h;
    const w = Math.abs(box.w);
    const h = Math.abs(box.h);
    this.ctx.fillRect(x, y, w, h);
    this.ctx.strokeRect(x, y, w, h);
    this.ctx.setLineDash([]);
    this.ctx.restore();
  }
}
