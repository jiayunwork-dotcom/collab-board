export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const distance = (x1: number, y1: number, x2: number, y2: number): number =>
  Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

export const uid = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

export const catmullRom = (points: Array<{ x: number; y: number }>, alpha = 0.5): Array<{ x: number; y: number }> => {
  if (points.length < 2) return points;

  const result: Array<{ x: number; y: number }> = [];
  const pts = [{ ...points[0] }, ...points, { ...points[points.length - 1] }];

  for (let i = 0; i < pts.length - 3; i++) {
    const p0 = pts[i], p1 = pts[i + 1], p2 = pts[i + 2], p3 = pts[i + 3];
    const d1 = distance(p0.x, p0.y, p1.x, p1.y);
    const d2 = distance(p1.x, p1.y, p2.x, p2.y);
    const d3 = distance(p2.x, p2.y, p3.x, p3.y);

    const steps = Math.max(8, Math.ceil(d2 / 3));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;

      const x = 0.5 * (
        (2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
      );
      const y = 0.5 * (
        (2 * p1.y) +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
      );
      result.push({ x, y });
    }
  }
  return result;
};

export const bezierControlPoints = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
  const dx = p2.x - p1.x;
  const cp1x = p1.x + dx * 0.4;
  const cp1y = p1.y;
  const cp2x = p2.x - dx * 0.4;
  const cp2y = p2.y;
  return { cp1: { x: cp1x, y: cp1y }, cp2: { x: cp2x, y: cp2y } };
};

export const pointInRect = (px: number, py: number, x: number, y: number, w: number, h: number): boolean =>
  px >= x && px <= x + w && py >= y && py <= y + h;

export const rectsIntersect = (a: { x: number; y: number; w: number; h: number },
                               b: { x: number; y: number; w: number; h: number }): boolean =>
  !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);

export const rotatePoint = (x: number, y: number, cx: number, cy: number, angleDeg: number) => {
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
};

export const getElementBBox = (el: { x: number; y: number; width: number; height: number; rotation?: number }) => {
  if (!el.rotation || el.rotation === 0) {
    return { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height };
  }
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const corners = [
    { x: el.x, y: el.y },
    { x: el.x + el.width, y: el.y },
    { x: el.x + el.width, y: el.y + el.height },
    { x: el.x, y: el.y + el.height },
  ].map(p => rotatePoint(p.x, p.y, cx, cy, el.rotation || 0));
  return {
    minX: Math.min(...corners.map(c => c.x)),
    minY: Math.min(...corners.map(c => c.y)),
    maxX: Math.max(...corners.map(c => c.x)),
    maxY: Math.max(...corners.map(c => c.y)),
  };
};

export const DEFAULT_COLORS = [
  '#0F172A', '#EF4444', '#F59E0B', '#EAB308', '#84CC16',
  '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6',
  '#D946EF', '#EC4899', '#FFFFFF', '#F3F4F6', '#9CA3AF',
  '#6B7280', '#374151', '#1F2937',
];

export const NOTE_COLORS = [
  { name: '黄色', fill: '#FEF3C7', stroke: '#F59E0B' },
  { name: '粉色', fill: '#FCE7F3', stroke: '#EC4899' },
  { name: '蓝色', fill: '#DBEAFE', stroke: '#3B82F6' },
  { name: '绿色', fill: '#DCFCE7', stroke: '#10B981' },
  { name: '紫色', fill: '#F3E8FF', stroke: '#8B5CF6' },
  { name: '橙色', fill: '#FFEDD5', stroke: '#EA580C' },
];

export const STROKE_WIDTHS = [1, 2, 3, 4, 6, 8, 12, 16, 20];
export const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];

export const deepClone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

export const debounce = <T extends (...args: any[]) => void>(fn: T, delay: number) => {
  let timer: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

export const throttle = <T extends (...args: any[]) => void>(fn: T, delay: number) => {
  let last = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - last >= delay) {
      last = now;
      fn(...args);
    }
  };
};
