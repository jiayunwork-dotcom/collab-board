import type { CanvasElement, CanvasConnection, Viewport } from '@/types';
import { getElementBBox, catmullRom } from '@/utils';

export const CONNECTION_POINTS = [
  'top', 'right', 'bottom', 'left',
  'topLeft', 'topRight', 'bottomRight', 'bottomLeft',
] as const;

export type ConnectionPoint = typeof CONNECTION_POINTS[number];

export function getElementConnectionPoint(
  el: CanvasElement,
  point: ConnectionPoint | 'auto',
  targetX?: number,
  targetY?: number
): { x: number; y: number } {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const hw = el.width / 2;
  const hh = el.height / 2;

  if (point === 'auto' && targetX !== undefined && targetY !== undefined) {
    const dx = targetX - cx;
    const dy = targetY - cy;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX / hw > absY / hh) {
      const slope = dy / (dx || 0.0001);
      const edgeX = dx >= 0 ? hw : -hw;
      return { x: cx + edgeX, y: cy + slope * edgeX };
    } else {
      const slope = dx / (dy || 0.0001);
      const edgeY = dy >= 0 ? hh : -hh;
      return { x: cx + slope * edgeY, y: cy + edgeY };
    }
  }

  const pt = point as ConnectionPoint;
  switch (pt) {
    case 'top': return { x: cx, y: el.y };
    case 'bottom': return { x: cx, y: el.y + el.height };
    case 'left': return { x: el.x, y: cy };
    case 'right': return { x: el.x + el.width, y: cy };
    case 'topLeft': return { x: el.x, y: el.y };
    case 'topRight': return { x: el.x + el.width, y: el.y };
    case 'bottomLeft': return { x: el.x, y: el.y + el.height };
    case 'bottomRight': return { x: el.x + el.width, y: el.y + el.height };
  }
  return { x: cx, y: cy };
}

export function getConnectionPath(
  conn: CanvasConnection,
  fromEl: CanvasElement,
  toEl: CanvasElement
): { path: string; from: { x: number; y: number }; to: { x: number; y: number }; midpoint: { x: number; y: number } } {
  const fromPt = getElementConnectionPoint(fromEl, conn.fromPoint as any,
    toEl.x + toEl.width / 2, toEl.y + toEl.height / 2);
  const toPt = getElementConnectionPoint(toEl, conn.toPoint as any,
    fromEl.x + fromEl.width / 2, fromEl.y + fromEl.height / 2);

  let path = '';
  const waypoints = conn.waypoints || [];

  if (conn.style === 'line') {
    path = `M ${fromPt.x} ${fromPt.y} L ${toPt.x} ${toPt.y}`;
  } else if (conn.style === 'polyline' && waypoints.length > 0) {
    const pts = [fromPt, ...waypoints, toPt];
    path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  } else {
    if (waypoints.length > 0) {
      const pts = [fromPt, ...waypoints, toPt];
      path = `M ${fromPt.x} ${fromPt.y}`;
      for (let i = 1; i < pts.length - 1; i++) {
        const xc = (pts[i].x + pts[i + 1].x) / 2;
        const yc = (pts[i].y + pts[i + 1].y) / 2;
        path += ` Q ${pts[i].x} ${pts[i].y} ${xc} ${yc}`;
      }
      path += ` T ${toPt.x} ${toPt.y}`;
    } else {
      const dx = toPt.x - fromPt.x;
      const dy = toPt.y - fromPt.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const curveFactor = Math.min(dist * 0.4, 80);

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      let cp1x = fromPt.x;
      let cp1y = fromPt.y;
      let cp2x = toPt.x;
      let cp2y = toPt.y;

      if (absDx > absDy) {
        cp1x = fromPt.x + Math.sign(dx) * curveFactor;
        cp2x = toPt.x - Math.sign(dx) * curveFactor;
      } else {
        cp1y = fromPt.y + Math.sign(dy) * curveFactor;
        cp2y = toPt.y - Math.sign(dy) * curveFactor;
      }

      path = `M ${fromPt.x} ${fromPt.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${toPt.x} ${toPt.y}`;
    }
  }

  const midpoint = {
    x: (fromPt.x + toPt.x) / 2,
    y: (fromPt.y + toPt.y) / 2,
  };

  return { path, from: fromPt, to: toPt, midpoint };
}

export function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
  size = 10
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, size / 2.5);
  ctx.lineTo(-size, -size / 2.5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export function isPointInViewport(
  x: number, y: number, w: number, h: number,
  vp: Viewport, padding = 50
): boolean {
  const vpLeft = vp.x - padding;
  const vpTop = vp.y - padding;
  const vpRight = vp.x + window.innerWidth / vp.zoom + padding;
  const vpBottom = vp.y + window.innerHeight / vp.zoom + padding;

  return !(x + w < vpLeft || x > vpRight || y + h < vpTop || y > vpBottom);
}

export function elementInViewport(el: CanvasElement, vp: Viewport): boolean {
  const bbox = getElementBBox(el);
  return isPointInViewport(bbox.minX, bbox.minY, bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, vp);
}

export function screenToWorld(sx: number, sy: number, vp: Viewport): { x: number; y: number } {
  return {
    x: sx / vp.zoom + vp.x,
    y: sy / vp.zoom + vp.y,
  };
}

export function worldToScreen(wx: number, wy: number, vp: Viewport): { x: number; y: number } {
  return {
    x: (wx - vp.x) * vp.zoom,
    y: (wy - vp.y) * vp.zoom,
  };
}
