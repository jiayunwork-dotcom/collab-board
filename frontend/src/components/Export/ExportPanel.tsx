import React, { useState, useRef, useCallback } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasElement, CanvasConnection } from '@/types';
import { canvasApi } from '@/api/client';
import { uid, getElementBBox } from '@/utils';
import { getConnectionPath } from '@/canvas/geometry';

export type ExportFormat = 'PNG' | 'SVG' | 'PDF' | 'JSON';

export interface ExportPanelProps {
  onClose: () => void;
  canvasRef?: React.RefObject<HTMLCanvasElement>;
}

interface ExportOptions {
  format: ExportFormat;
  scale: number;
  includeBackground: boolean;
  transparentBackground: boolean;
  onlySelection: boolean;
  padding: number;
  quality: number;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  onClose,
  canvasRef,
}) => {
  const store = useCanvasStore;
  const currentCanvas = store(s => s.currentCanvas);
  const elements = store(s => s.elements);
  const connections = store(s => s.connections);
  const selectedIds = store(s => s.selectedIds);
  const viewport = store(s => s.viewport);

  const [options, setOptions] = useState<ExportOptions>({
    format: 'PNG',
    scale: 2,
    includeBackground: true,
    transparentBackground: false,
    onlySelection: false,
    padding: 40,
    quality: 0.95,
  });

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');

  const panelRef = useRef<HTMLDivElement>(null);

  const getCanvasBounds = useCallback(() => {
    const els: CanvasElement[] = options.onlySelection
      ? Array.from(selectedIds).map(id => elements.get(id)!).filter(Boolean)
      : Array.from(elements.values());

    if (els.length === 0) {
      return { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    els.forEach(el => {
      const bbox = getElementBBox(el);
      minX = Math.min(minX, bbox.minX);
      minY = Math.min(minY, bbox.minY);
      maxX = Math.max(maxX, bbox.maxX);
      maxY = Math.max(maxY, bbox.maxY);
    });

    connections.forEach(conn => {
      const fromEl = elements.get(conn.fromElementId);
      const toEl = elements.get(conn.toElementId);
      if (!fromEl || !toEl) return;
      if (options.onlySelection) {
        if (!selectedIds.has(fromEl.id) || !selectedIds.has(toEl.id)) return;
      }
      try {
        const { from, to } = getConnectionPath(conn, fromEl, toEl);
        minX = Math.min(minX, from.x, to.x);
        minY = Math.min(minY, from.y, to.y);
        maxX = Math.max(maxX, from.x, to.x);
        maxY = Math.max(maxY, from.y, to.y);
      } catch {}
    });

    const p = options.padding;
    return {
      minX: minX - p, minY: minY - p, maxX: maxX + p, maxY: maxY + p,
    };
  }, [elements, connections, options, selectedIds]);

  const exportJson = useCallback(async () => {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      canvas: {
        id: currentCanvas?.canvas.id,
        title: currentCanvas?.canvas.title,
        backgroundType: currentCanvas?.canvas.backgroundType,
        backgroundColor: currentCanvas?.canvas.backgroundColor,
        gridSize: currentCanvas?.canvas.gridSize,
      },
      viewport,
      elements: Array.from(elements.values()),
      connections: Array.from(connections.values()),
    };

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentCanvas?.canvas.title || 'canvas'}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (currentCanvas?.canvas.id) {
      canvasApi.exportJson(currentCanvas.canvas.id).catch(() => {});
    }
  }, [elements, connections, currentCanvas, viewport]);

  const exportSvg = useCallback(async () => {
    const bounds = getCanvasBounds();
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const bgColor = options.transparentBackground ? 'transparent' : (currentCanvas?.canvas.backgroundColor || '#FFFFFF');

    const els = Array.from(elements.values());
    const conns = Array.from(connections.values());

    let svg = '';
    svg += `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;

    if (options.includeBackground && bgColor !== 'transparent') {
      svg += `  <rect x="0" y="0" width="100%" height="100%" fill="${bgColor}"/>\n`;
    }

    svg += `  <g transform="translate(${-bounds.minX}, ${-bounds.minY})">\n`;

    const sortedEls = [...els].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    sortedEls.forEach(el => {
      if (options.onlySelection && !selectedIds.has(el.id)) return;
      const d = el.data || {};
      const opacity = el.opacity ?? 1;
      const rotation = el.rotation || 0;
      const stroke = d.strokeColor || '#0F172A';
      const sw = d.strokeWidth || 2;
      const fill = d.fillColor || 'transparent';

      svg += `    <g opacity="${opacity}"`;
      if (rotation) {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        svg += ` transform="rotate(${rotation} ${cx} ${cy})"`;
      }
      svg += `>\n`;

      switch (el.type) {
        case 'rectangle':
        case 'sticky_note': {
          const radius = el.type === 'sticky_note' ? 4 : (d.borderRadius || 8);
          const nf = d.noteColor || fill;
          svg += `      <rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${radius}" ry="${radius}"`;
          if (nf !== 'transparent') svg += ` fill="${el.type === 'sticky_note' ? nf : fill}"`;
          if (sw > 0) svg += ` stroke="${stroke}" stroke-width="${sw}"`;
          svg += '/>\n';
          break;
        }
        case 'circle':
        case 'ellipse': {
          const cx = el.x + el.width / 2;
          const cy = el.y + el.height / 2;
          const rx = el.type === 'circle' ? Math.min(el.width, el.height) / 2 : el.width / 2;
          const ry = el.type === 'circle' ? Math.min(el.width, el.height) / 2 : el.height / 2;
          svg += `      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"`;
          if (fill !== 'transparent') svg += ` fill="${fill}"`;
          if (sw > 0) svg += ` stroke="${stroke}" stroke-width="${sw}"`;
          svg += '/>\n';
          break;
        }
        case 'diamond': {
          const cx = el.x + el.width / 2;
          const cy = el.y + el.height / 2;
          const pts = [`${cx},${el.y}`, `${el.x + el.width},${cy}`, `${cx},${el.y + el.height}`, `${el.x},${cy}`].join(' ');
          svg += `      <polygon points="${pts}"`;
          if (fill !== 'transparent') svg += ` fill="${fill}"`;
          if (sw > 0) svg += ` stroke="${stroke}" stroke-width="${sw}"`;
          svg += '/>\n';
          break;
        }
        case 'polygon': {
          const pts = (d.points || []).map(p => `${p.x},${p.y}`).join(' ');
          svg += `      <polygon points="${pts}"`;
          if (fill !== 'transparent') svg += ` fill="${fill}"`;
          if (sw > 0) svg += ` stroke="${stroke}" stroke-width="${sw}"`;
          svg += '/>\n';
          break;
        }
        case 'line':
        case 'arrow':
        case 'freehand': {
          const pts = d.points || [{ x: el.x, y: el.y }, { x: el.x + el.width, y: el.y + el.height }];
          const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          svg += `      <path d="${path}" fill="none"`;
          if (sw > 0) svg += ` stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
          svg += '/>\n';
          break;
        }
        case 'image': {
          if (d.imageData || d.imageUrl) {
            svg += `      <image x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" xlink:href="${d.imageData || d.imageUrl}" preserveAspectRatio="xMidYMid slice"/>\n`;
          } else {
            svg += `      <rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="#F3F4F6"/>\n`;
          }
          break;
        }
        default: {
          svg += `      <rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${d.borderRadius || 0}"`;
          if (d.noteColor) svg += ` fill="${d.noteColor}"`;
          else if (fill !== 'transparent') svg += ` fill="${fill}"`;
          if (sw > 0) svg += ` stroke="${stroke}" stroke-width="${sw}"`;
          svg += '/>\n';
          break;
        }
      }

      if (d.text) {
        const fontSize = d.fontSize || 16;
        const color = d.color || stroke;
        const align = d.align || 'center';
        const tx = el.x + (align === 'center' ? el.width / 2 : align === 'right' ? el.width - 12 : 12);
        const ty = el.y + el.height / 2;
        const safeText = d.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        svg += `      <text x="${tx}" y="${ty}" dominant-baseline="middle"`;
        svg += ` font-size="${fontSize}" fill="${color}" text-anchor="${align}" font-family="system-ui, sans-serif"`;
        if (d.bold) svg += ` font-weight="bold"`;
        if (d.italic) svg += ` font-style="italic"`;
        if (d.underline) svg += ` text-decoration="underline"`;
        svg += `>${safeText}</text>\n`;
      }

      svg += `    </g>\n`;
    });

    const sortedConns = [...conns].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    sortedConns.forEach(conn => {
      const fromEl = elements.get(conn.fromElementId);
      const toEl = elements.get(conn.toElementId);
      if (!fromEl || !toEl) return;
      if (options.onlySelection && (!selectedIds.has(fromEl.id) || !selectedIds.has(toEl.id))) return;
      try {
        const { path } = getConnectionPath(conn, fromEl, toEl);
        svg += `    <path d="${path}" fill="none" stroke="${conn.color}" stroke-width="${conn.thickness}" stroke-linecap="round" stroke-linejoin="round"/>\n`;
      } catch {}
    });

    svg += `  </g>\n</svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentCanvas?.canvas.title || 'canvas'}-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [elements, connections, currentCanvas, options, selectedIds, getCanvasBounds]);

  const exportPng = useCallback(async () => {
    const bounds = getCanvasBounds();
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const scale = options.scale;

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.translate(-bounds.minX, -bounds.minY);

    const bgColor = options.transparentBackground ? 'transparent' : (currentCanvas?.canvas.backgroundColor || '#FFFFFF');
    if (options.includeBackground && bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(bounds.minX, bounds.minY, width, height);
    }

    if (canvasRef?.current) {
      const src = canvasRef.current;
      const sx = bounds.minX * viewport.zoom - viewport.x * viewport.zoom;
      const sy = bounds.minY * viewport.zoom - viewport.y * viewport.zoom;
      const sw = width * viewport.zoom;
      const sh = height * viewport.zoom;
      try {
        ctx.drawImage(src, sx, sy, sw, sh, bounds.minX, bounds.minY, width, height);
      } catch {}
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentCanvas?.canvas.title || 'canvas'}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png', options.quality);
  }, [canvasRef, currentCanvas, options, viewport, getCanvasBounds]);

  const exportPdf = useCallback(async () => {
    await exportPng();
  }, [exportPng]);

  const handleExport = useCallback(async () => {
    try {
      setExporting(true);
      setProgress(10);
      setStatus('正在准备导出...');

      await new Promise(r => setTimeout(r, 200));
      setProgress(30);

      switch (options.format) {
        case 'JSON':
          setStatus('导出 JSON...');
          await exportJson();
          break;
        case 'SVG':
          setStatus('生成 SVG...');
          setProgress(50);
          await exportSvg();
          break;
        case 'PNG':
          setStatus('生成 PNG...');
          setProgress(50);
          await exportPng();
          break;
        case 'PDF':
          setStatus('生成 PDF...');
          setProgress(50);
          await exportPdf();
          break;
      }

      setProgress(100);
      setStatus('导出完成！');
      setTimeout(() => onClose(), 800);
    } catch (err: any) {
      setStatus(`导出失败: ${err?.message || '未知错误'}`);
    } finally {
      setTimeout(() => setExporting(false), 1000);
    }
  }, [options.format, exportJson, exportSvg, exportPng, exportPdf, onClose]);

  const formats: { format: ExportFormat; label: string; desc: string }[] = [
    { format: 'PNG', label: 'PNG 图片', desc: '高清位图' },
    { format: 'SVG', label: 'SVG 矢量', desc: '无限缩放' },
    { format: 'PDF', label: 'PDF 文档', desc: '适合打印' },
    { format: 'JSON', label: 'JSON 数据', desc: '原始数据' },
  ];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 99999,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !exporting) onClose(); }}
    >
      <div
        ref={panelRef}
        style={{
          width: '480px', maxHeight: '90vh', background: '#FFFFFF',
          borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '20px 24px', borderBottom: '1px solid #F1F5F9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>导出画布</h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>选择格式和选项</p>
          </div>
          <button
            onClick={() => !exporting && onClose()}
            disabled={exporting}
            style={{
              width: '32px', height: '32px', borderRadius: '8px',
              border: 'none', background: exporting ? '#F1F5F9' : 'transparent',
              cursor: exporting ? 'not-allowed' : 'pointer', color: '#64748B',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: '10px', marginBottom: '24px',
          }}>
            {formats.map(f => {
              const selected = options.format === f.format;
              return (
                <button
                  key={f.format}
                  type="button"
                  onClick={() => !exporting && setOptions(o => ({ ...o, format: f.format }))}
                  disabled={exporting}
                  style={{
                    padding: '14px', border: selected ? '2px solid #6366F1' : '1px solid #E2E8F0',
                    borderRadius: '10px', background: selected ? '#EEF2FF' : '#FFFFFF',
                    cursor: exporting ? 'not-allowed' : 'pointer',
                    textAlign: 'left', transition: 'all 0.15s',
                    opacity: exporting ? 0.6 : 1,
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: selected ? '#4F46E5' : '#0F172A' }}>
                    {f.label}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{f.desc}</div>
                </button>
              );
            })}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', marginBottom: '10px' }}>
              导出选项
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: exporting ? 'not-allowed' : 'pointer' }}>
                <input
                  type="checkbox" checked={options.includeBackground}
                  onChange={(e) => setOptions(o => ({ ...o, includeBackground: e.target.checked }))}
                  disabled={exporting}
                  style={{ width: '16px', height: '16px', accentColor: '#6366F1' }}
                />
                <div>
                  <div style={{ fontSize: '13px', color: '#334155', fontWeight: 500 }}>包含背景</div>
                  <div style={{ fontSize: '11px', color: '#94A3B8' }}>导出画布背景色和网格</div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: exporting ? 'not-allowed' : 'pointer' }}>
                <input
                  type="checkbox" checked={options.transparentBackground}
                  onChange={(e) => setOptions(o => ({ ...o, transparentBackground: e.target.checked }))}
                  disabled={exporting || !options.includeBackground}
                  style={{ width: '16px', height: '16px', accentColor: '#6366F1' }}
                />
                <div>
                  <div style={{ fontSize: '13px', color: '#334155', fontWeight: 500 }}>透明背景</div>
                  <div style={{ fontSize: '11px', color: '#94A3B8' }}>仅PNG/SVG支持</div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: exporting ? 'not-allowed' : 'pointer' }}>
                <input
                  type="checkbox" checked={options.onlySelection}
                  onChange={(e) => setOptions(o => ({ ...o, onlySelection: e.target.checked }))}
                  disabled={exporting || selectedIds.size === 0}
                  style={{ width: '16px', height: '16px', accentColor: '#6366F1' }}
                />
                <div>
                  <div style={{ fontSize: '13px', color: selectedIds.size === 0 ? '#CBD5E1' : '#334155', fontWeight: 500 }}>
                    仅导出选中内容
                  </div>
                  <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                    {selectedIds.size > 0 ? `已选 ${selectedIds.size} 个元素` : '请先选择元素'}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {(options.format === 'PNG' || options.format === 'PDF') && (
            <div style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A' }}>缩放比例</span>
                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 500 }}>{options.scale}x</span>
              </div>
              <input
                type="range" min={1} max={4} step={0.5} value={options.scale}
                onChange={(e) => setOptions(o => ({ ...o, scale: Number(e.target.value) }))}
                disabled={exporting}
                style={{ width: '100%', accentColor: '#6366F1' }}
              />
            </div>
          )}

          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A' }}>内边距</span>
              <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 500 }}>{options.padding}px</span>
            </div>
            <input
              type="range" min={0} max={100} step={5} value={options.padding}
              onChange={(e) => setOptions(o => ({ ...o, padding: Number(e.target.value) }))}
              disabled={exporting}
              style={{ width: '100%', accentColor: '#6366F1' }}
            />
          </div>
        </div>

        {exporting && (
          <div style={{ padding: '12px 24px', borderTop: '1px solid #F1F5F9' }}>
            <div style={{
              height: '4px', background: '#E2E8F0', borderRadius: '2px',
              overflow: 'hidden', marginBottom: '8px',
            }}>
              <div style={{
                height: '100%', width: `${progress}%`,
                background: 'linear-gradient(90deg,#6366F1,#8B5CF6)', transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', textAlign: 'center' }}>{status}</div>
          </div>
        )}

        <div style={{
          padding: '16px 24px 20px', display: 'flex', gap: '10px',
          borderTop: '1px solid #F1F5F9',
        }}>
          <button
            type="button"
            onClick={() => !exporting && onClose()}
            disabled={exporting}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: '8px',
              border: '1px solid #E2E8F0', background: '#FFFFFF',
              color: '#475569', fontSize: '14px', fontWeight: 500,
              cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.6 : 1,
            }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: '8px',
              border: 'none', background: exporting ? '#A5B4FC' : '#6366F1',
              color: '#FFFFFF', fontSize: '14px', fontWeight: 600,
              cursor: exporting ? 'not-allowed' : 'pointer',
              boxShadow: exporting ? 'none' : '0 2px 6px rgba(99,102,241,0.3)',
            }}
          >
            {exporting ? '导出中...' : '开始导出'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportPanel;
