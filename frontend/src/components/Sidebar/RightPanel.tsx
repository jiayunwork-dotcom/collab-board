import React, { useState } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasElement } from '@/types';
import { DEFAULT_COLORS, NOTE_COLORS, STROKE_WIDTHS, FONT_SIZES, getElementBBox } from '@/utils';
import { elementApi } from '@/api/client';
import { collabClient } from '@/collaboration/CollabClient';

type TabKey = 'properties' | 'layers';

const RightPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('properties');
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const {
    elements,
    selectedIds,
    updateElement,
    deleteElement,
    setSelectedIds,
    toggleSelected,
    clearSelection,
    groupElements,
    ungroupElements,
    canvasRole,
  } = useCanvasStore();

  const canvasId = useCanvasStore.getState().currentCanvas?.canvas.id;
  const canEdit = canvasRole && canvasRole !== 'VIEWER' && canvasRole !== 'PUBLIC';

  const selectedElements: CanvasElement[] = [];
  selectedIds.forEach(id => {
    const el = elements.get(id);
    if (el) selectedElements.push(el);
    else {
      elements.forEach(e => {
        if (e.groupId === id && !selectedElements.includes(e)) selectedElements.push(e);
      });
    }
  });

  const primaryElement = selectedElements[0];

  const syncUpdate = (id: string, updates: Partial<CanvasElement>) => {
    updateElement(id, updates);
    if (canvasId && canEdit) {
      const el = elements.get(id);
      if (el) {
        const payload: Partial<CanvasElement> = {};
        Object.keys(updates).forEach(k => {
          (payload as any)[k] = (updates as any)[k];
        });
        elementApi.update(canvasId, id, payload).catch(console.error);
        collabClient.sendOperation('UPDATE_ELEMENT', { id, ...payload });
      }
    }
  };

  const syncSelectedUpdate = (updates: Partial<CanvasElement>) => {
    selectedElements.forEach(el => {
      syncUpdate(el.id, updates);
    });
  };

  const syncDataUpdate = (id: string, dataUpdates: Record<string, any>) => {
    const el = elements.get(id);
    if (!el) return;
    const newData = { ...el.data, ...dataUpdates };
    updateElement(id, { data: newData });
    if (canvasId && canEdit) {
      elementApi.update(canvasId, id, { data: newData }).catch(console.error);
      collabClient.sendOperation('UPDATE_ELEMENT', { id, data: newData });
    }
  };

  const syncSelectedDataUpdate = (dataUpdates: Record<string, any>) => {
    selectedElements.forEach(el => {
      syncDataUpdate(el.id, dataUpdates);
    });
  };

  const getSelectionBounds = () => {
    if (selectedElements.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectedElements.forEach(el => {
      const bbox = getElementBBox(el);
      minX = Math.min(minX, bbox.minX);
      minY = Math.min(minY, bbox.minY);
      maxX = Math.max(maxX, bbox.maxX);
      maxY = Math.max(maxY, bbox.maxY);
    });
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  };

  const alignElements = (type: 'left' | 'right' | 'top' | 'bottom' | 'hcenter' | 'vcenter') => {
    if (selectedElements.length < 2) return;
    const bounds = getSelectionBounds();
    if (!bounds) return;
    selectedElements.forEach(el => {
      let newX = el.x;
      let newY = el.y;
      const bbox = getElementBBox(el);
      switch (type) {
        case 'left':
          newX = el.x + (bounds.minX - bbox.minX);
          break;
        case 'right':
          newX = el.x + (bounds.maxX - bbox.maxX);
          break;
        case 'top':
          newY = el.y + (bounds.minY - bbox.minY);
          break;
        case 'bottom':
          newY = el.y + (bounds.maxY - bbox.maxY);
          break;
        case 'hcenter':
          newX = el.x + (bounds.minX + bounds.width / 2 - (bbox.minX + (bbox.maxX - bbox.minX) / 2));
          break;
        case 'vcenter':
          newY = el.y + (bounds.minY + bounds.height / 2 - (bbox.minY + (bbox.maxY - bbox.minY) / 2));
          break;
      }
      syncUpdate(el.id, { x: newX, y: newY });
    });
  };

  const distributeElements = (type: 'horizontal' | 'vertical') => {
    if (selectedElements.length < 3) return;
    const sorted = [...selectedElements].sort((a, b) => {
      const ab = getElementBBox(a);
      const bb = getElementBBox(b);
      return type === 'horizontal' ? ab.minX - bb.minX : ab.minY - bb.minY;
    });
    const first = getElementBBox(sorted[0]);
    const last = getElementBBox(sorted[sorted.length - 1]);
    const totalSpan = type === 'horizontal'
      ? last.maxX - first.minX
      : last.maxY - first.minY;
    const totalSize = sorted.reduce((sum, el) => {
      const bbox = getElementBBox(el);
      return sum + (type === 'horizontal' ? bbox.maxX - bbox.minX : bbox.maxY - bbox.minY);
    }, 0);
    const gap = (totalSpan - totalSize) / (sorted.length - 1);

    let currentPos = type === 'horizontal' ? first.minX : first.minY;
    sorted.forEach((el) => {
      const bbox = getElementBBox(el);
      const size = type === 'horizontal' ? bbox.maxX - bbox.minX : bbox.maxY - bbox.minY;
      if (type === 'horizontal') {
        syncUpdate(el.id, { x: el.x + (currentPos - bbox.minX) });
      } else {
        syncUpdate(el.id, { y: el.y + (currentPos - bbox.minY) });
      }
      currentPos += size + gap;
    });
  };

  const handleGroup = () => {
    if (selectedIds.size < 2 || !canEdit) return;
    const ids = [...selectedIds];
    const groupId = groupElements(ids);
    setSelectedIds([groupId]);
    if (canvasId && canEdit) {
      ids.forEach(id => {
        const el = elements.get(id);
        if (el) {
          elementApi.update(canvasId, id, { groupId }).catch(console.error);
          collabClient.sendOperation('UPDATE_ELEMENT', { id, groupId });
        }
      });
    }
  };

  const handleUngroup = () => {
    if (selectedIds.size === 0 || !canEdit) return;
    const groupIds = [...selectedIds];
    groupIds.forEach(gid => {
      if (!elements.has(gid)) {
        ungroupElements(gid);
        elements.forEach(el => {
          if (el.groupId === gid) {
            syncUpdate(el.id, { groupId: undefined } as any);
          }
        });
      }
    });
    clearSelection();
  };

  const moveZIndex = (direction: 'front' | 'forward' | 'backward' | 'back') => {
    if (selectedIds.size === 0 || !canEdit) return;
    const sorted = [...elements.values()].sort((a, b) => a.zIndex - b.zIndex);
    const zIndexMap = new Map(sorted.map((el, i) => [el.id, i]));
    selectedIds.forEach(id => {
      const el = elements.get(id);
      if (!el) return;
      let newZ = zIndexMap.get(id) || 0;
      switch (direction) {
        case 'front': newZ = sorted.length + selectedIds.size; break;
        case 'forward': newZ = Math.min(sorted.length, newZ + 1); break;
        case 'backward': newZ = Math.max(0, newZ - 1); break;
        case 'back': newZ = -selectedIds.size; break;
      }
      syncUpdate(id, { zIndex: newZ });
    });
  };

  const sortedLayerEls = [...elements.values()]
    .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

  const toggleVisibility = (id: string) => {
    const el = elements.get(id);
    if (!el) return;
    syncUpdate(id, { visible: !el.visible });
  };

  const handleLayerDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleLayerDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggingId || draggingId === targetId || !canEdit) {
      setDraggingId(null);
      return;
    }
    const dragEl = elements.get(draggingId);
    const targetEl = elements.get(targetId);
    if (!dragEl || !targetEl) {
      setDraggingId(null);
      return;
    }
    const dropZ = targetEl.zIndex;
    syncUpdate(draggingId, { zIndex: dropZ + 0.5 });
    setTimeout(() => {
      const newSorted = [...elements.values()].sort((a, b) => a.zIndex - b.zIndex);
      newSorted.forEach((el, i) => {
        updateElement(el.id, { zIndex: i });
      });
    }, 10);
    setDraggingId(null);
  };

  const deleteSelected = () => {
    if (selectedIds.size === 0 || !canEdit) return;
    const ids = [...selectedIds];
    ids.forEach(id => deleteElement(id));
    if (canvasId) {
      elementApi.batchDelete(canvasId, ids).catch(console.error);
      collabClient.sendOperation('BATCH_DELETE_ELEMENTS', { ids });
    }
    clearSelection();
  };

  return (
    <div className="w-72 h-full bg-white border-l border-slate-200 flex flex-col">
      <div className="flex border-b border-slate-200">
        {(['properties', 'layers'] as TabKey[]).map(tab => (
          <button
            key={tab}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'properties' ? '属性' : '图层'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar">
        {activeTab === 'properties' ? (
          <div className="p-4 space-y-5">
            {selectedElements.length === 0 ? (
              <div className="text-center text-slate-400 py-12 text-sm">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                选择元素后编辑属性
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">位置与大小</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">X</label>
                      <input
                        type="number"
                        className="input w-full text-sm py-1.5"
                        value={Math.round(primaryElement?.x || 0)}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          selectedElements.forEach((el, i) => {
                            syncUpdate(el.id, { x: i === 0 ? v : el.x + (v - (primaryElement?.x || 0)) });
                          });
                        }}
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Y</label>
                      <input
                        type="number"
                        className="input w-full text-sm py-1.5"
                        value={Math.round(primaryElement?.y || 0)}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          selectedElements.forEach((el, i) => {
                            syncUpdate(el.id, { y: i === 0 ? v : el.y + (v - (primaryElement?.y || 0)) });
                          });
                        }}
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">宽度</label>
                      <input
                        type="number"
                        className="input w-full text-sm py-1.5"
                        value={Math.round(primaryElement?.width || 0)}
                        onChange={(e) => syncSelectedUpdate({ width: Math.max(1, Number(e.target.value)) })}
                        disabled={!canEdit || selectedElements.length > 1}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">高度</label>
                      <input
                        type="number"
                        className="input w-full text-sm py-1.5"
                        value={Math.round(primaryElement?.height || 0)}
                        onChange={(e) => syncSelectedUpdate({ height: Math.max(1, Number(e.target.value)) })}
                        disabled={!canEdit || selectedElements.length > 1}
                      />
                    </div>
                  </div>
                </div>

                {primaryElement && ['text', 'sticky_note', 'mindnode', 'rectangle', 'circle', 'ellipse', 'diamond'].includes(primaryElement.type) && (
                  <div className="space-y-3 border-t border-slate-100 pt-4">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">文本内容</span>
                    <textarea
                      className="input w-full text-sm min-h-[80px] resize-none"
                      value={primaryElement?.data.text || ''}
                      onChange={(e) => syncDataUpdate(primaryElement.id, { text: e.target.value })}
                      disabled={!canEdit || selectedElements.length > 1}
                      placeholder="输入文本内容..."
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">字号</label>
                        <select
                          className="input w-full text-sm py-1.5"
                          value={primaryElement?.data.fontSize || 16}
                          onChange={(e) => syncSelectedDataUpdate({ fontSize: Number(e.target.value) })}
                          disabled={!canEdit}
                        >
                          {FONT_SIZES.map(s => (
                            <option key={s} value={s}>{s}px</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">对齐</label>
                        <select
                          className="input w-full text-sm py-1.5"
                          value={primaryElement?.data.align || 'center'}
                          onChange={(e) => syncDataUpdate(primaryElement.id, { align: e.target.value as any })}
                          disabled={!canEdit || selectedElements.length > 1}
                        >
                          <option value="left">左对齐</option>
                          <option value="center">居中</option>
                          <option value="right">右对齐</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {(['bold', 'italic', 'underline'] as const).map(style => (
                        <button
                          key={style}
                          className={`btn btn-icon btn-sm ${primaryElement?.data[style] ? 'active' : ''}`}
                          onClick={() => syncSelectedDataUpdate({ [style]: !(primaryElement?.data[style] || false) })}
                          disabled={!canEdit}
                          title={style === 'bold' ? '加粗' : style === 'italic' ? '斜体' : '下划线'}
                        >
                          {style === 'bold' ? <span className="font-bold">B</span> : style === 'italic' ? <span className="italic">I</span> : <span className="underline">U</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">样式</span>

                  <div>
                    <label className="block text-xs text-slate-500 mb-2">描边颜色</label>
                    <div className="flex flex-wrap gap-1.5">
                      {DEFAULT_COLORS.map(c => (
                        <div
                          key={c}
                          className={`color-swatch ${primaryElement?.data.strokeColor === c ? 'active' : ''}`}
                          style={{ background: c, border: c === '#FFFFFF' ? '1px solid #e2e8f0' : undefined }}
                          onClick={() => syncSelectedDataUpdate({ strokeColor: c })}
                        />
                      ))}
                    </div>
                  </div>

                  {primaryElement?.type !== 'sticky_note' && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-2">填充颜色</label>
                      <div className="flex flex-wrap gap-1.5">
                        <div
                          className={`color-swatch ${!primaryElement?.data.fillColor || primaryElement?.data.fillColor === 'transparent' ? 'active' : ''}`}
                          style={{ background: 'repeating-linear-gradient(45deg, #ccc, #ccc 2px, #fff 2px, #fff 4px)' }}
                          onClick={() => syncSelectedDataUpdate({ fillColor: 'transparent' })}
                          title="无填充"
                        />
                        {DEFAULT_COLORS.filter(c => c !== '#FFFFFF').slice(0, 17).map(c => (
                          <div
                            key={c}
                            className={`color-swatch ${primaryElement?.data.fillColor === c ? 'active' : ''}`}
                            style={{ background: c }}
                            onClick={() => syncSelectedDataUpdate({ fillColor: c })}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {primaryElement?.type === 'sticky_note' && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-2">便签颜色</label>
                      <div className="flex flex-wrap gap-1.5">
                        {NOTE_COLORS.map(nc => (
                          <div
                            key={nc.fill}
                            className={`color-swatch ${primaryElement?.data.noteColor === nc.fill ? 'active' : ''}`}
                            style={{ background: nc.fill, borderColor: nc.stroke }}
                            onClick={() => syncSelectedDataUpdate({ noteColor: nc.fill, strokeColor: nc.stroke })}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs text-slate-500 mb-1">线条粗细</label>
                    <div className="flex flex-wrap gap-1">
                      {STROKE_WIDTHS.slice(0, 7).map(w => (
                        <button
                          key={w}
                          className={`btn btn-icon btn-sm ${primaryElement?.data.strokeWidth === w ? 'active' : ''}`}
                          onClick={() => syncSelectedDataUpdate({ strokeWidth: w })}
                          disabled={!canEdit}
                          title={`${w}px`}
                        >
                          <div className="rounded-full bg-slate-800" style={{ width: Math.max(4, w), height: Math.max(4, w) }} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      透明度 {Math.round((primaryElement?.opacity ?? 1) * 100)}%
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round((primaryElement?.opacity ?? 1) * 100)}
                      onChange={(e) => syncSelectedUpdate({ opacity: Number(e.target.value) / 100 })}
                      disabled={!canEdit}
                      className="w-full accent-indigo-600"
                    />
                  </div>

                  {primaryElement && ['text', 'sticky_note', 'mindnode', 'rectangle', 'circle', 'ellipse', 'diamond'].includes(primaryElement.type) && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">文字颜色</label>
                      <div className="flex flex-wrap gap-1.5">
                        {DEFAULT_COLORS.map(c => (
                          <div
                            key={c}
                            className={`color-swatch ${primaryElement?.data.color === c ? 'active' : ''}`}
                            style={{ background: c, border: c === '#FFFFFF' ? '1px solid #e2e8f0' : undefined }}
                            onClick={() => syncDataUpdate(primaryElement.id, { color: c })}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">排列</span>

                  <div>
                    <label className="block text-xs text-slate-500 mb-2">对齐</label>
                    <div className="grid grid-cols-6 gap-1">
                      {[
                        { type: 'left', icon: 'M4 5h16M4 12h10M4 19h14', title: '左对齐' },
                        { type: 'hcenter', icon: 'M4 5h16M7 12h10M5 19h14', title: '水平居中' },
                        { type: 'right', icon: 'M4 5h16M10 12h10M6 19h14', title: '右对齐' },
                        { type: 'top', icon: 'M5 4h14v16M12 4v10M8 4v7', title: '顶对齐' },
                        { type: 'vcenter', icon: 'M5 4h14v16M12 7v10M8 9v6', title: '垂直居中' },
                        { type: 'bottom', icon: 'M5 4h14v16M12 10v10M8 13v7', title: '底对齐' },
                      ].map(a => (
                        <button
                          key={a.type}
                          className="btn btn-icon btn-sm"
                          onClick={() => alignElements(a.type as any)}
                          disabled={!canEdit || selectedElements.length < 2}
                          title={a.title}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d={a.icon} />
                          </svg>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 mb-2">分布</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className="btn btn-sm"
                        onClick={() => distributeElements('horizontal')}
                        disabled={!canEdit || selectedElements.length < 3}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mr-1">
                          <rect x="3" y="5" width="4" height="14" /><rect x="17" y="5" width="4" height="14" /><path d="M7 12h10" />
                        </svg>
                        水平分布
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => distributeElements('vertical')}
                        disabled={!canEdit || selectedElements.length < 3}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mr-1">
                          <rect x="5" y="3" width="14" height="4" /><rect x="5" y="17" width="14" height="4" /><path d="M12 7v10" />
                        </svg>
                        垂直分布
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 mb-2">图层顺序</label>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { dir: 'front', icon: 'M7 14l4-4 4 4M7 20l4-4 4 4', title: '置于顶层' },
                        { dir: 'forward', icon: 'M8 7h8M8 12h8M8 17h5', title: '上移一层' },
                        { dir: 'backward', icon: 'M8 7h5M8 12h8M8 17h8', title: '下移一层' },
                        { dir: 'back', icon: 'M7 10l4 4 4-4M7 4l4 4 4-4', title: '置于底层' },
                      ].map(z => (
                        <button
                          key={z.dir}
                          className="btn btn-icon btn-sm"
                          onClick={() => moveZIndex(z.dir as any)}
                          disabled={!canEdit || selectedIds.size === 0}
                          title={z.title}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d={z.icon} />
                          </svg>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">操作</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className="btn btn-sm"
                      onClick={handleGroup}
                      disabled={!canEdit || selectedIds.size < 2}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mr-1">
                        <rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /><path d="M11 11l2 2" />
                      </svg>
                      编组
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={handleUngroup}
                      disabled={!canEdit || selectedIds.size === 0}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mr-1">
                        <rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" />
                      </svg>
                      解组
                    </button>
                    <button
                      className="btn btn-sm btn-danger col-span-2"
                      onClick={deleteSelected}
                      disabled={!canEdit || selectedIds.size === 0}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mr-1">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      </svg>
                      删除
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="p-3">
            {sortedLayerEls.length === 0 ? (
              <div className="text-center text-slate-400 py-12 text-sm">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10" />
                </svg>
                暂无图层
              </div>
            ) : (
              <div className="space-y-0.5">
                {sortedLayerEls.map(el => (
                  <div
                    key={el.id}
                    draggable={canEdit === true}
                    onDragStart={(e) => handleLayerDragStart(e, el.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleLayerDrop(e, el.id)}
                    className={`list-item group ${selectedIds.has(el.id) || selectedIds.has(el.groupId || '') ? 'bg-indigo-50 border border-indigo-200' : ''} ${draggingId === el.id ? 'opacity-50' : ''}`}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        toggleSelected(el.groupId || el.id, true);
                      } else {
                        setSelectedIds([el.groupId || el.id]);
                      }
                    }}
                    style={{ padding: '8px 10px' }}
                  >
                    <button
                      className="mr-1 p-0.5 rounded hover:bg-slate-200 flex-shrink-0"
                      onClick={(e) => { e.stopPropagation(); toggleVisibility(el.id); }}
                      title={el.visible === false ? '显示' : '隐藏'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={el.visible === false ? 'text-slate-300' : 'text-slate-500'}>
                        {el.visible === false ? (
                          <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
                          <path d="M1 1l22 22" /></>
                        ) : (
                          <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                        )}
                      </svg>
                    </button>
                    <div
                      className="w-6 h-6 rounded border border-slate-200 flex-shrink-0 flex items-center justify-center"
                      style={{ background: el.data.noteColor || el.data.fillColor || '#fff' }}
                    >
                      {el.type === 'text' && <span className="text-xs font-bold">T</span>}
                      {el.type === 'sticky_note' && <span className="text-xs">📝</span>}
                      {el.type === 'image' && <span className="text-xs">🖼️</span>}
                      {el.type === 'mindnode' && <span className="text-xs">🧠</span>}
                      {el.type === 'freehand' && <span className="text-xs">✏️</span>}
                      {el.type === 'rectangle' && <div className="w-3 h-3 border border-slate-500" style={{ background: el.data.fillColor || 'transparent' }} />}
                      {el.type === 'circle' && <div className="w-3 h-3 rounded-full border border-slate-500" style={{ background: el.data.fillColor || 'transparent' }} />}
                      {el.type === 'ellipse' && <div className="w-4 h-2 rounded-full border border-slate-500" style={{ background: el.data.fillColor || 'transparent' }} />}
                      {el.type === 'diamond' && <div className="w-3 h-3 rotate-45 border border-slate-500" style={{ background: el.data.fillColor || 'transparent' }} />}
                      {(el.type === 'line' || el.type === 'arrow') && <div className="w-4 h-0.5 bg-slate-500" />}
                    </div>
                    <span className="text-sm text-slate-700 truncate flex-1">
                      {el.data.text?.slice(0, 12) || el.type}
                      {el.groupId && <span className="text-xs text-indigo-500 ml-1">[G]</span>}
                    </span>
                    {el.locked && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RightPanel;
