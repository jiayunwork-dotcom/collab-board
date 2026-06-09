import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasElement, CanvasConnection } from '@/types';
import { uid, deepClone } from '@/utils';
import {
  buildMindTree,
  applyLayout,
  animatePositions,
  MindNode,
} from '@/utils/layout';
import { collabClient } from '@/collaboration/CollabClient';
import { elementApi } from '@/api/client';

export interface MindMapPanelProps {
  onClose: () => void;
}

export type LayoutMode = 'tree' | 'radial' | 'fishbone';

const LAYOUT_LABELS: Record<LayoutMode, { label: string; icon: string; desc: string }> = {
  tree: { label: '树状布局', icon: '🌳', desc: '水平层级结构' },
  radial: { label: '放射布局', icon: '☀️', desc: '中心向外辐射' },
  fishbone: { label: '鱼骨布局', icon: '🐟', desc: '因果分析' },
};

const LEVEL_COLORS = [
  { fill: '#DBEAFE', stroke: '#2563EB', text: '#1E40AF' },
  { fill: '#FCE7F3', stroke: '#DB2777', text: '#9D174D' },
  { fill: '#DCFCE7', stroke: '#059669', text: '#065F46' },
  { fill: '#FEF3C7', stroke: '#D97706', text: '#92400E' },
  { fill: '#F3E8FF', stroke: '#7C3AED', text: '#5B21B6' },
  { fill: '#FFEDD5', stroke: '#EA580C', text: '#9A3412' },
];

const NODE_SHAPES: { id: string; label: string; icon: string }[] = [
  { id: 'rounded', label: '圆角矩形', icon: '▢' },
  { id: 'rectangle', label: '矩形', icon: '☐' },
  { id: 'ellipse', label: '椭圆', icon: '⬭' },
  { id: 'diamond', label: '菱形', icon: '◇' },
];

export const MindMapPanel: React.FC<MindMapPanelProps> = ({ onClose }) => {
  const store = useCanvasStore;
  const currentCanvas = store(s => s.currentCanvas);
  const elements = store(s => s.elements);
  const connections = store(s => s.connections);
  const selectedIds = store(s => s.selectedIds);
  const mindMapMode = store(s => s.mindMapMode);
  const layoutMode = store(s => s.layoutMode);
  const setMindMapMode = store(s => s.setMindMapMode);
  const setLayoutMode = store(s => s.setLayoutMode);
  const viewport = store(s => s.viewport);
  const setViewport = store(s => s.setViewport);
  const setSelectedIds = store(s => s.setSelectedIds);
  const addElement = store(s => s.addElement);
  const updateElement = store(s => s.updateElement);
  const deleteElement = store(s => s.deleteElement);
  const addConnection = store(s => s.addConnection);
  const deleteConnection = store(s => s.deleteConnection);

  const [panelMode, setPanelMode] = useState<LayoutMode>(layoutMode || 'tree');
  const [showShapePicker, setShowShapePicker] = useState(false);
  const [animating, setAnimating] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelAnimRef = useRef<(() => void) | null>(null);

  const canvasId = currentCanvas?.canvas.id;

  const sendOp = useCallback((type: string, payload: Record<string, any>) => {
    if (collabClient.isConnected()) {
      collabClient.sendOperation(type, payload);
    } else if (canvasId) {
      if (type === 'CREATE_ELEMENT') elementApi.create(canvasId, payload).catch(() => {});
      else if (type === 'UPDATE_ELEMENT') elementApi.update(canvasId, payload.id, payload).catch(() => {});
      else if (type === 'DELETE_ELEMENT') elementApi.delete(canvasId, payload.id).catch(() => {});
      else if (type === 'CREATE_CONNECTION') elementApi.createConnection(canvasId, payload).catch(() => {});
      else if (type === 'DELETE_CONNECTION') elementApi.deleteConnection(canvasId, payload.id).catch(() => {});
    }
  }, [canvasId]);

  const mindNodes = useMemo(() => {
    const els = Array.from(elements.values()).filter(e => e.type === 'mindnode');
    return buildMindTree(els);
  }, [elements]);

  const mindElements = useMemo(() =>
    Array.from(elements.values()).filter(e => e.type === 'mindnode'),
    [elements]
  );

  const rootNodes = mindNodes;
  const totalNodes = mindElements.length;
  const totalConnections = Array.from(connections.values()).filter(c => {
    const f = elements.get(c.fromElementId);
    const t = elements.get(c.toElementId);
    return f?.type === 'mindnode' && t?.type === 'mindnode';
  }).length;

  const selectedMindNode = useMemo(() => {
    const firstSel = Array.from(selectedIds)[0];
    if (!firstSel) return null;
    const el = elements.get(firstSel);
    if (el?.type !== 'mindnode') return null;
    return el;
  }, [selectedIds, elements]);

  const rebuildConnections = useCallback(() => {
    const existingPairs = new Set<string>();
    Array.from(connections.values()).forEach(c => {
      existingPairs.add(`${c.fromElementId}->${c.toElementId}`);
    });

    const els = Array.from(elements.values()).filter(e => e.type === 'mindnode');
    const byId = new Map(els.map(e => [e.id, e]));

    els.forEach(el => {
      if (!el.parentId) return;
      const pair = `${el.parentId}->${el.id}`;
      if (existingPairs.has(pair)) return;
      const parent = byId.get(el.parentId);
      if (!parent) return;

      const maxZ = Math.max(0, ...Array.from(connections.values()).map(c => c.zIndex || 0));
      const conn: CanvasConnection = {
        id: uid(),
        canvasId,
        fromElementId: el.parentId,
        toElementId: el.id,
        fromPoint: 'auto',
        toPoint: 'auto',
        style: 'curve',
        arrowStyle: 'end',
        color: '#94A3B8',
        thickness: 2,
        waypoints: [],
        zIndex: Math.min(-1, maxZ),
      };
      addConnection(conn);
      sendOp('CREATE_CONNECTION', conn);
      existingPairs.add(pair);
    });
  }, [connections, elements, canvasId, addConnection, store]);

  const relayout = useCallback(() => {
    if (animating) return;
    const startPositions = new Map<string, { x: number; y: number }>();
    mindElements.forEach(el => {
      startPositions.set(el.id, { x: el.x, y: el.y });
    });

    const endPositions = applyLayout(mindElements, panelMode);

    const nodeWidths = new Map<string, number>();
    mindElements.forEach(el => {
      nodeWidths.set(el.id, el.width);
    });

    const adjustedEnd = new Map<string, { x: number; y: number }>();
    endPositions.forEach((p, id) => {
      const w = nodeWidths.get(id) || 160;
      adjustedEnd.set(id, p);
    });

    setAnimating(true);
    cancelAnimRef.current?.();

    cancelAnimRef.current = animatePositions(
      startPositions,
      adjustedEnd,
      450,
      (positions) => {
        positions.forEach((p, id) => {
          updateElement(id, { x: p.x, y: p.y });
        });
      },
      () => {
        setAnimating(false);
        adjustedEnd.forEach((p, id) => {
          const el = elements.get(id);
          if (!el) return;
          sendOp('UPDATE_ELEMENT', {
            id: el.id,
            x: el.x, y: el.y,
          });
        });
        rebuildConnections();
      },
    );

    const allBboxes = mindElements.map(e => {
      const p = adjustedEnd.get(e.id) || { x: e.x, y: e.y };
      return { minX: p.x, minY: p.y, maxX: p.x + e.width, maxY: p.y + e.height };
    });
    if (allBboxes.length > 0) {
      const minX = Math.min(...allBboxes.map(b => b.minX));
      const maxX = Math.max(...allBboxes.map(b => b.maxX));
      const minY = Math.min(...allBboxes.map(b => b.minY));
      const maxY = Math.max(...allBboxes.map(b => b.maxY));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const targetZoom = Math.min(
        1,
        (window.innerWidth - 100) / (maxX - minX || 1),
        (window.innerHeight - 200) / (maxY - minY || 1),
      );
      const newZoom = Math.max(0.3, targetZoom);
      const newX = cx - window.innerWidth / 2 / newZoom;
      const newY = cy - window.innerHeight / 2 / newZoom;
      setViewport({ x: newX, y: newY, zoom: newZoom });
      try { collabClient.sendViewport(newX, newY, newZoom); } catch {}
    }
  }, [mindElements, panelMode, animating, updateElement, elements, sendOp, rebuildConnections, setViewport]);

  const createMindMap = useCallback(() => {
    const maxZ = Math.max(0, ...Array.from(elements.values()).map(e => e.zIndex || 0));
    const colors = LEVEL_COLORS[0];
    const el: CanvasElement = {
      id: uid(),
      canvasId,
      type: 'mindnode',
      parentId: undefined,
      x: viewport.x + window.innerWidth / 2 / viewport.zoom - 100,
      y: viewport.y + window.innerHeight / 2 / viewport.zoom - 30,
      width: 200,
      height: 60,
      rotation: 0,
      zIndex: maxZ + 1,
      opacity: 1,
      locked: false,
      visible: true,
      data: {
        text: '中心主题',
        fontSize: 18,
        bold: true,
        fillColor: colors.fill,
        strokeColor: colors.stroke,
        color: colors.text,
        shape: 'rounded',
        collapsed: false,
        mindMapLevel: 0,
      },
    };
    addElement(el);
    sendOp('CREATE_ELEMENT', el);
    setSelectedIds([el.id]);
    if (panelMode) setLayoutMode(panelMode);
  }, [canvasId, elements, viewport, addElement, sendOp, setSelectedIds, panelMode, setLayoutMode]);

  const addChildNode = useCallback((parentId: string) => {
    const parent = elements.get(parentId);
    if (!parent) return;
    const maxZ = Math.max(0, ...Array.from(elements.values()).map(e => e.zIndex || 0));
    const level = (parent.data?.mindMapLevel || 0) + 1;
    const colors = LEVEL_COLORS[Math.min(level, LEVEL_COLORS.length - 1)];
    const el: CanvasElement = {
      id: uid(),
      canvasId,
      type: 'mindnode',
      parentId,
      x: parent.x + parent.width + 80,
      y: parent.y,
      width: 160,
      height: 50,
      rotation: 0,
      zIndex: maxZ + 1,
      opacity: 1,
      locked: false,
      visible: true,
      data: {
        text: '新节点',
        fontSize: 15,
        bold: level < 2,
        fillColor: colors.fill,
        strokeColor: colors.stroke,
        color: colors.text,
        shape: parent.data?.shape || 'rounded',
        collapsed: false,
        mindMapLevel: level,
      },
    };
    addElement(el);
    sendOp('CREATE_ELEMENT', el);

    setTimeout(() => {
      const maxZ2 = Math.max(0, ...Array.from(store.getState().connections.values()).map(c => c.zIndex || 0));
      const conn: CanvasConnection = {
        id: uid(),
        canvasId,
        fromElementId: parentId,
        toElementId: el.id,
        fromPoint: 'auto',
        toPoint: 'auto',
        style: 'curve',
        arrowStyle: 'end',
        color: colors.stroke,
        thickness: 2,
        waypoints: [],
        zIndex: Math.min(-1, maxZ2),
      };
      store.getState().addConnection(conn);
      sendOp('CREATE_CONNECTION', conn);
      setSelectedIds([el.id]);
      setTimeout(() => relayout(), 50);
    }, 30);
  }, [canvasId, elements, addElement, sendOp, store, setSelectedIds, relayout]);

  const addSiblingNode = useCallback((siblingId: string) => {
    const sib = elements.get(siblingId);
    if (!sib) return;
    if (!sib.parentId) {
      addChildNode(siblingId);
      return;
    }
    addChildNode(sib.parentId);
  }, [elements, addChildNode]);

  const deleteNodeAndChildren = useCallback((nodeId: string) => {
    const toDelete: string[] = [];
    const collect = (id: string) => {
      toDelete.push(id);
      Array.from(elements.values())
        .filter(e => e.parentId === id)
        .forEach(e => collect(e.id));
    };
    collect(nodeId);

    const confirmed = toDelete.length > 1
      ? window.confirm(`确定要删除该节点及其 ${toDelete.length - 1} 个子节点吗？`)
      : true;
    if (!confirmed) return;

    toDelete.forEach(id => {
      deleteElement(id);
      sendOp('DELETE_ELEMENT', { id });
      Array.from(connections.values()).forEach(c => {
        if (c.fromElementId === id || c.toElementId === id) {
          deleteConnection(c.id);
          sendOp('DELETE_CONNECTION', { id: c.id });
        }
      });
    });
  }, [elements, connections, deleteElement, deleteConnection, sendOp]);

  const toggleCollapse = useCallback((nodeId: string) => {
    const node = elements.get(nodeId);
    if (!node) return;
    const collapsed = !node.data?.collapsed;

    const toToggle: string[] = [];
    const collect = (id: string, depth: number) => {
      if (depth === 0) return;
      Array.from(elements.values())
        .filter(e => e.parentId === id)
        .forEach(e => {
          toToggle.push(e.id);
          if (!collapsed) collect(e.id, depth - 1);
        });
    };
    collect(nodeId, 999);

    updateElement(nodeId, {
      data: { ...node.data, collapsed },
    });
    sendOp('UPDATE_ELEMENT', {
      id: nodeId,
      data: { ...node.data, collapsed },
    });

    toToggle.forEach(id => {
      const e = elements.get(id);
      if (!e) return;
      updateElement(id, { visible: !collapsed });
      sendOp('UPDATE_ELEMENT', { id, visible: !collapsed });
    });

    Array.from(connections.values()).forEach(c => {
      if (toToggle.includes(c.fromElementId) || toToggle.includes(c.toElementId)) {
        // Connection visibility handled by element visibility
      }
    });

    setTimeout(() => relayout(), 30);
  }, [elements, updateElement, sendOp, relayout]);

  const updateSelectedShape = useCallback((shapeId: string) => {
    if (!selectedMindNode) return;
    updateElement(selectedMindNode.id, {
      data: { ...selectedMindNode.data, shape: shapeId as any },
    });
    sendOp('UPDATE_ELEMENT', {
      id: selectedMindNode.id,
      data: { ...selectedMindNode.data, shape: shapeId },
    });
    setShowShapePicker(false);
  }, [selectedMindNode, updateElement, sendOp]);

  useEffect(() => {
    setMindMapMode(true);
    return () => setMindMapMode(false);
  }, [setMindMapMode]);

  useEffect(() => {
    setPanelMode(layoutMode || 'tree');
  }, [layoutMode]);

  useEffect(() => {
    if (panelMode && panelMode !== layoutMode) {
      setLayoutMode(panelMode);
    }
  }, [panelMode, layoutMode, setLayoutMode]);

  const TreeView: React.FC<{ nodes: MindNode[]; depth?: number }> = ({ nodes, depth = 0 }) => (
    <div style={{
      display: 'flex', flexDirection: 'column',
      gap: '4px',
      paddingLeft: depth > 0 ? '16px' : 0,
      borderLeft: depth > 0 ? '1px dashed #CBD5E1' : 'none',
      marginLeft: depth > 0 ? '8px' : 0,
    }}>
      {nodes.map(node => {
        const hasChildren = node.children.length > 0;
        const isSel = selectedIds.has(node.id);
        const coll = node.element.data?.collapsed;
        return (
          <div key={node.id}>
            <div
              onClick={() => {
                setSelectedIds([node.id]);
                store.getState().setViewport({
                  x: node.element.x + node.element.width / 2 - window.innerWidth / 2 / viewport.zoom,
                  y: node.element.y + node.element.height / 2 - window.innerHeight / 2 / viewport.zoom,
                  zoom: viewport.zoom,
                });
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: isSel ? '#EEF2FF' : 'transparent',
                border: isSel ? '1px solid #C7D2FE' : '1px solid transparent',
                transition: 'all 0.12s',
                fontSize: '12px',
              }}
              onMouseEnter={(e) => {
                if (!isSel) e.currentTarget.style.background = '#F8FAFC';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isSel ? '#EEF2FF' : 'transparent';
              }}
            >
              {hasChildren ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCollapse(node.id);
                  }}
                  style={{
                    width: '18px', height: '18px',
                    border: 'none', borderRadius: '4px',
                    background: coll ? '#F1F5F9' : '#E0E7FF',
                    color: coll ? '#64748B' : '#4F46E5',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px', fontWeight: 700,
                    flexShrink: 0,
                    transition: 'transform 0.15s',
                    transform: coll ? 'rotate(-90deg)' : 'rotate(0)',
                  }}
                >
                  ▾
                </button>
              ) : (
                <span style={{ width: '18px', display: 'inline-block', flexShrink: 0 }} />
              )}
              <div
                style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: node.element.data?.strokeColor || '#6366F1',
                  flexShrink: 0,
                }}
              />
              <span style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: isSel ? '#4F46E5' : '#334155',
                fontWeight: isSel ? 600 : depth === 0 ? 600 : 400,
              }}>
                {node.element.data?.text || '(空)'}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  addChildNode(node.id);
                }}
                style={{
                  width: '20px', height: '20px',
                  border: 'none', borderRadius: '5px',
                  background: 'transparent',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px', fontWeight: 600,
                  opacity: 0,
                  transition: 'all 0.12s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.background = '#DBEAFE';
                  e.currentTarget.style.color = '#2563EB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0';
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#94A3B8';
                }}
                title="添加子节点"
              >
                +
              </button>
            </div>
            {hasChildren && !coll && (
              <TreeView nodes={node.children} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed', top: 0, right: 0,
        width: '340px', height: '100vh',
        background: '#FFFFFF',
        borderLeft: '1px solid #E2E8F0',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.08)',
        zIndex: 9998,
        display: 'flex', flexDirection: 'column',
      }}
      ref={panelRef}
    >
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #F1F5F9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(135deg, #6366F108, #8B5CF608)',
      }}>
        <div>
          <h2 style={{
            margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            🧠 思维导图
          </h2>
          <p style={{
            margin: '2px 0 0', fontSize: '11px', color: '#64748B',
          }}>
            {totalNodes} 个节点 · {totalConnections} 条连线
          </p>
        </div>
        <button
          onClick={() => onClose()}
          style={{
            width: '32px', height: '32px', borderRadius: '8px',
            border: 'none', background: 'transparent',
            cursor: 'pointer', color: '#64748B',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '18px',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#F1F5F9';
            e.currentTarget.style.color = '#334155';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#64748B';
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            fontSize: '11px', fontWeight: 600,
            color: '#64748B', textTransform: 'uppercase',
            letterSpacing: '0.5px', marginBottom: '8px',
          }}>
            布局方式
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: '6px',
          }}>
            {(Object.keys(LAYOUT_LABELS) as LayoutMode[]).map(mode => {
              const cfg = LAYOUT_LABELS[mode];
              const selected = panelMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setPanelMode(mode);
                    setLayoutMode(mode);
                  }}
                  style={{
                    padding: '12px 8px',
                    border: selected ? '2px solid #6366F1' : '1px solid #E2E8F0',
                    borderRadius: '10px',
                    background: selected ? '#EEF2FF' : '#FFFFFF',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) {
                      e.currentTarget.style.borderColor = '#CBD5E1';
                      e.currentTarget.style.background = '#FAFAFA';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = selected ? '2px solid #6366F1' : '1px solid #E2E8F0';
                    e.currentTarget.style.background = selected ? '#EEF2FF' : '#FFFFFF';
                  }}
                >
                  <span style={{ fontSize: '20px' }}>{cfg.icon}</span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: selected ? 700 : 500,
                    color: selected ? '#4F46E5' : '#334155',
                  }}>
                    {cfg.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <button
            type="button"
            onClick={relayout}
            disabled={animating || totalNodes === 0}
            style={{
              width: '100%',
              padding: '10px 16px',
              border: 'none',
              borderRadius: '8px',
              background: animating || totalNodes === 0 ? '#CBD5E1' : 'linear-gradient(135deg, #6366F1, #8B5CF6)',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 600,
              cursor: animating || totalNodes === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: animating || totalNodes === 0 ? 'none' : '0 2px 8px rgba(99,102,241,0.3)',
              transition: 'all 0.15s',
            }}
          >
            {animating ? (
              <>
                <span style={{
                  display: 'inline-block',
                  animation: 'spin 1s linear infinite',
                }}>
                  ⟳
                </span>
                重新布局中...
              </>
            ) : (
              <>✨ 自动布局</>
            )}
          </button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <button
            type="button"
            onClick={createMindMap}
            style={{
              width: '100%',
              padding: '10px 16px',
              border: '2px dashed #C7D2FE',
              borderRadius: '8px',
              background: '#EEF2FF30',
              color: '#4F46E5',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#EEF2FF';
              e.currentTarget.style.borderColor = '#6366F1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#EEF2FF30';
              e.currentTarget.style.borderColor = '2px dashed #C7D2FE';
            }}
          >
            ＋ 创建中心主题
          </button>
        </div>

        {selectedMindNode && (
          <div style={{
            marginBottom: '20px',
            padding: '14px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
          }}>
            <div style={{
              fontSize: '11px', fontWeight: 600,
              color: '#64748B', textTransform: 'uppercase',
              letterSpacing: '0.5px', marginBottom: '10px',
            }}>
              选中节点
            </div>

            <div style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#0F172A',
              marginBottom: '10px',
              padding: '8px 10px',
              background: '#FFFFFF',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {selectedMindNode.data?.text || '(空)'}
            </div>

            <div style={{ marginBottom: '10px' }}>
              <div style={{
                fontSize: '11px', color: '#94A3B8',
                marginBottom: '6px',
              }}>
                节点样式
              </div>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowShapePicker(!showShapePicker)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid #E2E8F0',
                    borderRadius: '6px',
                    background: '#FFFFFF',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: '#334155',
                  }}
                >
                  <span style={{ fontSize: '16px' }}>
                    {NODE_SHAPES.find(s => s.id === (selectedMindNode.data?.shape || 'rounded'))?.icon || '▢'}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    {NODE_SHAPES.find(s => s.id === (selectedMindNode.data?.shape || 'rounded'))?.label}
                  </span>
                  <span style={{ color: '#94A3B8', fontSize: '10px' }}>▼</span>
                </button>
                {showShapePicker && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '4px',
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    padding: '6px',
                    zIndex: 100,
                  }}>
                    {NODE_SHAPES.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => updateSelectedShape(s.id)}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          border: 'none',
                          borderRadius: '6px',
                          background: s.id === selectedMindNode.data?.shape ? '#EEF2FF' : 'transparent',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '12px',
                          color: s.id === selectedMindNode.data?.shape ? '#4F46E5' : '#334155',
                          fontWeight: s.id === selectedMindNode.data?.shape ? 600 : 400,
                        }}
                      >
                        <span>{s.icon}</span>
                        <span>{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              marginTop: '12px',
            }}>
              <button
                type="button"
                onClick={() => addChildNode(selectedMindNode.id)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #C7D2FE',
                  borderRadius: '6px',
                  background: '#EEF2FF',
                  color: '#4F46E5',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#E0E7FF';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#EEF2FF';
                }}
              >
                ➕ 添加子节点
              </button>
              <button
                type="button"
                onClick={() => addSiblingNode(selectedMindNode.id)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #E2E8F0',
                  borderRadius: '6px',
                  background: '#FFFFFF',
                  color: '#475569',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                ↔ 添加同级节点
              </button>
              <button
                type="button"
                onClick={() => toggleCollapse(selectedMindNode.id)}
                disabled={rootNodes.find(r => r.id === selectedMindNode.id)?.children.length === 0}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #E2E8F0',
                  borderRadius: '6px',
                  background: '#FFFFFF',
                  color: '#475569',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                {selectedMindNode.data?.collapsed ? '⤴ 展开子节点' : '⤵ 折叠子节点'}
              </button>
              <button
                type="button"
                onClick={() => deleteNodeAndChildren(selectedMindNode.id)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #FECACA',
                  borderRadius: '6px',
                  background: '#FEF2F2',
                  color: '#B91C1C',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  marginTop: '4px',
                }}
              >
                🗑 删除节点
              </button>
            </div>
          </div>
        )}

        <div>
          <div style={{
            fontSize: '11px', fontWeight: 600,
            color: '#64748B', textTransform: 'uppercase',
            letterSpacing: '0.5px', marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>节点树</span>
            <span style={{
              fontWeight: 400,
              textTransform: 'none',
              letterSpacing: 0,
              color: '#94A3B8',
            }}>
              {rootNodes.length} 个主题
            </span>
          </div>

          {rootNodes.length === 0 ? (
            <div style={{
              padding: '30px 20px',
              textAlign: 'center',
              background: '#FAFAFA',
              borderRadius: '10px',
              border: '1px dashed #E2E8F0',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🌱</div>
              <div style={{
                fontSize: '12px', color: '#64748B',
                fontWeight: 500,
              }}>
                暂无思维导图
              </div>
              <div style={{
                fontSize: '11px', color: '#94A3B8',
                marginTop: '4px',
              }}>
                点击上方创建中心主题
              </div>
            </div>
          ) : (
            <div style={{
              padding: '10px 12px',
              background: '#FAFAFA',
              borderRadius: '10px',
              border: '1px solid #F1F5F9',
            }}>
              <TreeView nodes={rootNodes} />
            </div>
          )}
        </div>
      </div>

      <div style={{
        padding: '12px 20px 16px',
        borderTop: '1px solid #F1F5F9',
        background: '#FAFAFA',
      }}>
        <div style={{
          fontSize: '10px',
          color: '#94A3B8',
          lineHeight: 1.6,
        }}>
          💡 提示：按 <kbd style={{
            padding: '1px 5px',
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '3px',
            fontSize: '9px',
            fontFamily: 'monospace',
          }}>Tab</kbd> 添加子节点，<kbd style={{
            padding: '1px 5px',
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '3px',
            fontSize: '9px',
            fontFamily: 'monospace',
          }}>Enter</kbd> 添加同级节点
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default MindMapPanel;
