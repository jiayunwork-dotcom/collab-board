import type { CanvasElement } from '@/types';
import { uid } from '@/utils';

export interface MindNode {
  id: string;
  element: CanvasElement;
  children: MindNode[];
}

export function buildMindTree(elements: CanvasElement[]): MindNode[] {
  const byId = new Map<string, MindNode>();
  const byParent = new Map<string, MindNode[]>();

  const mindNodes = elements.filter(e => e.type === 'mindnode');
  const roots: MindNode[] = [];

  mindNodes.forEach(el => {
    const node: MindNode = { id: el.id, element: el, children: [] };
    byId.set(el.id, node);
    if (!el.parentId) {
      roots.push(node);
    } else {
      if (!byParent.has(el.parentId)) byParent.set(el.parentId, []);
      byParent.get(el.parentId)!.push(node);
    }
  });

  byId.forEach((node) => {
    const children = byParent.get(node.id);
    if (children) {
      node.children = children;
    }
  });

  return roots;
}

interface LayoutOptions {
  horizontalGap?: number;
  verticalGap?: number;
  nodeWidth?: number;
  nodeHeight?: number;
  direction?: 'horizontal' | 'vertical';
}

export function reingoldTilford(roots: MindNode[], options: LayoutOptions = {}): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const hGap = options.horizontalGap ?? 80;
  const vGap = options.verticalGap ?? 30;
  const direction = options.direction ?? 'vertical';

  const getSubtreeHeight = (node: MindNode): number => {
    if (node.children.length === 0) {
      return (node.element.height || 60) + vGap;
    }
    return Math.max(
      (node.element.height || 60),
      node.children.reduce((s, c) => s + getSubtreeHeight(c), 0)
    );
  };

  const layout = (node: MindNode, x: number, yCenter: number) => {
    const w = node.element.width || 180;
    const h = node.element.height || 60;

    if (direction === 'vertical') {
      positions.set(node.id, { x, y: yCenter - h / 2 });

      if (node.children.length > 0) {
        const childX = x + w + hGap;
        let totalHeight = node.children.reduce((s, c) => s + getSubtreeHeight(c), 0) - vGap;
        let currentY = yCenter - totalHeight / 2;

        node.children.forEach(child => {
          const ch = getSubtreeHeight(child);
          layout(child, childX, currentY + ch / 2);
          currentY += ch;
        });
      }
    } else {
      positions.set(node.id, { x: yCenter - w / 2, y: x });

      if (node.children.length > 0) {
        const childY = x + h + vGap;
        let totalWidth = node.children.reduce((s, c) => {
          return s + (c.element.width || 160) + hGap;
        }, 0) - hGap;
        let currentX = yCenter - totalWidth / 2;

        node.children.forEach(child => {
          const cw = (child.element.width || 160);
          layout(child, childY, currentX + cw / 2);
          currentX += cw + hGap;
        });
      }
    }
  };

  if (roots.length > 0) {
    const totalHeight = roots.reduce((s, r) => s + getSubtreeHeight(r), 0);
    let currentY = -totalHeight / 2;
    roots.forEach(root => {
      const h = getSubtreeHeight(root);
      layout(root, -300, currentY + h / 2);
      currentY += h;
    });
  }

  return positions;
}

export function radialLayout(roots: MindNode[], options: LayoutOptions = {}): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const radiusStep = 200;

  const layoutLevel = (nodes: MindNode[], radius: number, startAngle: number, endAngle: number) => {
    if (nodes.length === 0) return;
    const angleStep = (endAngle - startAngle) / nodes.length;

    nodes.forEach((node, i) => {
      const angle = startAngle + angleStep * (i + 0.5);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      positions.set(node.id, {
        x: x - (node.element.width || 160) / 2,
        y: y - (node.element.height || 60) / 2,
      });

      if (node.children.length > 0) {
        layoutLevel(
          node.children,
          radius + radiusStep,
          angle - angleStep / 2,
          angle + angleStep / 2
        );
      }
    });
  };

  roots.forEach((root, idx) => {
    positions.set(root.id, {
      x: -(root.element.width || 180) / 2 + idx * 200,
      y: -(root.element.height || 60) / 2,
    });

    if (root.children.length > 0) {
      layoutLevel(root.children, radiusStep, 0, Math.PI * 2);
    }
  });

  return positions;
}

export function fishboneLayout(roots: MindNode[], options: LayoutOptions = {}): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const branchGap = 120;
  const subGap = 60;

  roots.forEach((root, rootIdx) => {
    const rw = root.element.width || 200;
    const rh = root.element.height || 60;
    const rootX = -400 + rootIdx * 900;
    positions.set(root.id, { x: rootX, y: -rh / 2 });

    let upperOffset = 0;
    let lowerOffset = 0;

    root.children.forEach((child, i) => {
      const isUpper = i % 2 === 0;
      const baseY = isUpper ? -branchGap - upperOffset : branchGap + lowerOffset;
      const x = rootX + rw + 150 + Math.floor(i / 2) * 220;

      positions.set(child.id, {
        x,
        y: baseY - (child.element.height || 50) / 2,
      });

      if (isUpper) upperOffset += 20;
      else lowerOffset += 20;

      child.children.forEach((sub, j) => {
        positions.set(sub.id, {
          x: x + (child.element.width || 160) + subGap,
          y: baseY + (j - child.children.length / 2) * 50,
        });
      });
    });
  });

  return positions;
}

export function applyLayout(
  elements: CanvasElement[],
  mode: 'tree' | 'radial' | 'fishbone'
): Map<string, { x: number; y: number }> {
  const roots = buildMindTree(elements);
  switch (mode) {
    case 'radial':
      return radialLayout(roots);
    case 'fishbone':
      return fishboneLayout(roots);
    case 'tree':
    default:
      return reingoldTilford(roots);
  }
}

export function animatePositions(
  startPositions: Map<string, { x: number; y: number }>,
  endPositions: Map<string, { x: number; y: number }>,
  duration: number,
  onFrame: (positions: Map<string, { x: number; y: number }>) => void,
  onComplete?: () => void
): () => void {
  const startTime = performance.now();
  let rafId: number;

  const animate = (now: number) => {
    const t = Math.min(1, (now - startTime) / duration);
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const current = new Map<string, { x: number; y: number }>();

    endPositions.forEach((end, id) => {
      const start = startPositions.get(id) || end;
      current.set(id, {
        x: start.x + (end.x - start.x) * ease,
        y: start.y + (end.y - start.y) * ease,
      });
    });

    onFrame(current);

    if (t < 1) {
      rafId = requestAnimationFrame(animate);
    } else {
      onComplete?.();
    }
  };

  rafId = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(rafId);
}
