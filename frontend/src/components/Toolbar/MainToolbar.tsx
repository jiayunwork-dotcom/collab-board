import React, { useState } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import type { Tool } from '@/types';
import { DEFAULT_COLORS, STROKE_WIDTHS, FONT_SIZES } from '@/utils';
import { canvasApi, authApi } from '@/api/client';
import { useNavigate } from 'react-router-dom';
import NotificationBell from '@/components/Notification/NotificationBell';

interface ToolButton {
  tool: Tool;
  icon: string;
  label: string;
  shortcut?: string;
}

const TOOL_BUTTONS: ToolButton[] = [
  { tool: 'select', icon: 'M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z', label: '选择', shortcut: 'V' },
  { tool: 'pan', icon: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20', label: '平移', shortcut: 'H' },
  { tool: 'freehand', icon: 'M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.586 7.586M11 11a2 2 0 1 1-4 0 2 2 0 0 1 4 0z', label: '画笔', shortcut: 'P' },
  { tool: 'line', icon: 'M4 20L20 4', label: '直线', shortcut: 'L' },
  { tool: 'arrow', icon: 'M5 12h14M12 5l7 7-7 7', label: '箭头', shortcut: 'A' },
  { tool: 'rectangle', icon: 'M3 3h18v18H3z', label: '矩形', shortcut: 'R' },
  { tool: 'circle', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', label: '圆形', shortcut: 'O' },
  { tool: 'ellipse', icon: 'M12 2c5.5 0 10 4.5 10 10s-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2z', label: '椭圆' },
  { tool: 'diamond', icon: 'M12 2L22 12 12 22 2 12z', label: '菱形' },
  { tool: 'polygon', icon: 'M12 2l10 7.5v13L2 22.5v-13L12 2z', label: '多边形' },
  { tool: 'text', icon: 'M4 7V4h16v3M9 20h6M12 4v16', label: '文本', shortcut: 'T' },
  { tool: 'sticky_note', icon: 'M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3zM15 3v5h5', label: '便签', shortcut: 'N' },
  { tool: 'image', icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M8.5 10.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM21 15l-5-5L5 21', label: '图片' },
  { tool: 'connection', icon: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71', label: '连线' },
  { tool: 'mindnode', icon: 'M12 2v4M12 10v4M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 8v4M7.5 14.5L10 12M16.5 14.5L14 12', label: '思维导图' },
  { tool: 'comment', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 10h.01M12 10h.01M16 10h.01', label: '评论', shortcut: 'C' },
];

const Popover: React.FC<{
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  trigger: React.ReactNode;
}> = ({ open, onClose, children, trigger }) => {
  const [popover, setPopover] = useState(false);
  const show = open || popover;
  return (
    <div className="relative" onMouseLeave={() => setPopover(false)}>
      <div onMouseEnter={() => setPopover(true)} onClick={() => setPopover(v => !v)}>
        {trigger}
      </div>
      {show && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setPopover(false); onClose(); }} />
          <div className="absolute top-full left-0 mt-2 z-20 panel p-2 min-w-[200px] shadow-lg">
            {children}
          </div>
        </>
      )}
    </div>
  );
};

const MainToolbar: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentCanvas,
    currentTool,
    setCurrentTool,
    strokeColor,
    setStrokeColor,
    fillColor,
    setFillColor,
    strokeWidth,
    setStrokeWidth,
    fontSize,
    setFontSize,
    updateCanvasMeta,
    mindMapMode,
    setMindMapMode,
    canvasRole,
    currentUser,
    setCurrentUser,
  } = useCanvasStore();

  const canEdit = canvasRole && canvasRole !== 'VIEWER' && canvasRole !== 'PUBLIC';
  const bgType = currentCanvas?.canvas.backgroundType || 'GRID_DOTS';

  const handleExport = async () => {
    if (!currentCanvas) return;
    try {
      await canvasApi.exportJson(currentCanvas.canvas.id);
    } catch (e) {
      console.error('Export failed', e);
    }
  };

  const handleSave = async () => {
    if (!currentCanvas) return;
    try {
      await canvasApi.autoSave(currentCanvas.canvas.id);
      alert('保存成功');
    } catch (e) {
      console.error('Save failed', e);
    }
  };

  const bgOptions: Array<{ value: 'SOLID' | 'GRID_DOTS' | 'GRID_LINES'; label: string; icon: string }> = [
    { value: 'SOLID', label: '纯色', icon: 'M3 3h18v18H3z' },
    { value: 'GRID_DOTS', label: '点阵', icon: 'M5 5h.01M10 5h.01M15 5h.01M20 5h.01M5 10h.01M10 10h.01M15 10h.01M20 10h.01M5 15h.01M10 15h.01M15 15h.01M20 15h.01M5 20h.01M10 20h.01M15 20h.01M20 20h.01' },
    { value: 'GRID_LINES', label: '网格线', icon: 'M4 4v16M8 4v16M12 4v16M16 4v16M20 4v16M4 4h16M4 8h16M4 12h16M4 16h16M4 20h16' },
  ];

  return (
    <div className="flex items-center justify-between p-3 bg-white border-b border-slate-200">
      <div className="flex items-center gap-2">
        <button
          className="btn btn-icon btn-sm"
          onClick={() => navigate('/dashboard')}
          title="返回仪表盘"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="h-6 w-px bg-slate-200 mx-1" />

        <input
          className="input text-sm font-semibold bg-transparent border-none focus:border-indigo-500 focus:bg-white px-2 py-1 min-w-[200px]"
          value={currentCanvas?.canvas.title || ''}
          onChange={(e) => updateCanvasMeta({ title: e.target.value })}
          placeholder="画布标题"
        />

        <div className="h-6 w-px bg-slate-200 mx-2" />

        <div className="toolbar">
          {TOOL_BUTTONS.slice(0, 8).map((btn) => (
            <button
              key={btn.tool}
              className={`btn btn-icon btn-sm ${currentTool === btn.tool ? 'active' : ''}`}
              onClick={() => canEdit && setCurrentTool(btn.tool)}
              title={`${btn.label}${btn.shortcut ? ` (${btn.shortcut})` : ''}`}
              disabled={!canEdit}
              style={{ opacity: canEdit ? 1 : 0.5 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={btn.icon} />
              </svg>
            </button>
          ))}

          <div className="divider" />

          {TOOL_BUTTONS.slice(8, 16).map((btn) => (
            <button
              key={btn.tool}
              className={`btn btn-icon btn-sm ${currentTool === btn.tool ? 'active' : ''}`}
              onClick={() => canEdit && setCurrentTool(btn.tool)}
              title={`${btn.label}${btn.shortcut ? ` (${btn.shortcut})` : ''}`}
              disabled={!canEdit}
              style={{ opacity: canEdit ? 1 : 0.5 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={btn.icon} />
              </svg>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="toolbar">
          <Popover open={false} onClose={() => {}} trigger={
            <button
              className="btn btn-icon btn-sm"
              title="描边颜色"
            >
              <div
                className="w-4 h-4 rounded border border-slate-300"
                style={{ background: strokeColor }}
              />
            </button>
          }>
            <div className="mb-2 text-xs font-medium text-slate-600 px-1">描边颜色</div>
            <div className="color-picker">
              {DEFAULT_COLORS.map((c) => (
                <div
                  key={c}
                  className={`color-swatch ${strokeColor === c ? 'active' : ''}`}
                  style={{ background: c, border: c === '#FFFFFF' ? '1px solid #e2e8f0' : undefined }}
                  onClick={() => setStrokeColor(c)}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 px-2 py-2 border-t border-slate-100 mt-1">
              <input
                type="color"
                value={strokeColor}
                onChange={(e) => setStrokeColor(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer"
              />
              <input
                className="input text-xs flex-1 py-1"
                value={strokeColor}
                onChange={(e) => setStrokeColor(e.target.value)}
              />
            </div>
          </Popover>

          <Popover open={false} onClose={() => {}} trigger={
            <button
              className="btn btn-icon btn-sm"
              title="填充颜色"
            >
              <div
                className="w-4 h-4 rounded border border-slate-300"
                style={{ background: fillColor === 'transparent' ? 'repeating-linear-gradient(45deg, #ccc, #ccc 2px, #fff 2px, #fff 4px)' : fillColor }}
              />
            </button>
          }>
            <div className="mb-2 text-xs font-medium text-slate-600 px-1">填充颜色</div>
            <div className="color-picker">
              <div
                className={`color-swatch ${fillColor === 'transparent' ? 'active' : ''}`}
                style={{ background: 'repeating-linear-gradient(45deg, #ccc, #ccc 2px, #fff 2px, #fff 4px)' }}
                onClick={() => setFillColor('transparent')}
                title="无填充"
              />
              {DEFAULT_COLORS.filter(c => c !== '#FFFFFF').slice(0, 17).map((c) => (
                <div
                  key={c}
                  className={`color-swatch ${fillColor === c ? 'active' : ''}`}
                  style={{ background: c, border: c === '#FFFFFF' ? '1px solid #e2e8f0' : undefined }}
                  onClick={() => setFillColor(c)}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 px-2 py-2 border-t border-slate-100 mt-1">
              <input
                type="color"
                value={fillColor === 'transparent' ? '#ffffff' : fillColor}
                onChange={(e) => setFillColor(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer"
              />
              <input
                className="input text-xs flex-1 py-1"
                value={fillColor}
                onChange={(e) => setFillColor(e.target.value)}
              />
            </div>
          </Popover>

          <div className="divider" />

          <Popover open={false} onClose={() => {}} trigger={
            <button
              className="btn btn-sm gap-1 min-w-[48px]"
              title="线条粗细"
            >
              <span className="text-xs font-medium">{strokeWidth}px</span>
            </button>
          }>
            <div className="mb-2 text-xs font-medium text-slate-600 px-1">线条粗细</div>
            <div className="grid grid-cols-3 gap-1 p-1">
              {STROKE_WIDTHS.map((w) => (
                <button
                  key={w}
                  className={`btn btn-sm ${strokeWidth === w ? 'active' : ''} justify-start`}
                  onClick={() => setStrokeWidth(w)}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="rounded-full bg-slate-800"
                      style={{ width: Math.max(4, w), height: Math.max(4, w) }}
                    />
                    <span className="text-xs">{w}px</span>
                  </div>
                </button>
              ))}
            </div>
          </Popover>

          <Popover open={false} onClose={() => {}} trigger={
            <button
              className="btn btn-sm gap-1 min-w-[48px]"
              title="字号"
            >
              <span className="text-xs font-medium">{fontSize}px</span>
            </button>
          }>
            <div className="mb-2 text-xs font-medium text-slate-600 px-1">字号</div>
            <div className="grid grid-cols-3 gap-1 p-1 max-h-48 overflow-y-auto scrollbar">
              {FONT_SIZES.map((s) => (
                <button
                  key={s}
                  className={`btn btn-sm ${fontSize === s ? 'active' : ''}`}
                  onClick={() => setFontSize(s)}
                >
                  <span style={{ fontSize: Math.min(s, 14) }}>{s}px</span>
                </button>
              ))}
            </div>
          </Popover>

          <div className="divider" />

          <button
            className="btn btn-icon btn-sm"
            title="撤销 (Ctrl+Z)"
            disabled
            style={{ opacity: 0.5 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 7" />
            </svg>
          </button>
          <button
            className="btn btn-icon btn-sm"
            title="重做 (Ctrl+Y)"
            disabled
            style={{ opacity: 0.5 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 7v6h-6M21 13a9 9 0 1 1-3-7.7L21 7" />
            </svg>
          </button>

          <div className="divider" />

          <Popover open={false} onClose={() => {}} trigger={
            <button
              className="btn btn-icon btn-sm"
              title="背景网格"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={bgOptions.find(o => o.value === bgType)?.icon} />
              </svg>
            </button>
          }>
            <div className="mb-2 text-xs font-medium text-slate-600 px-1">背景类型</div>
            <div className="flex flex-col gap-1 p-1">
              {bgOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={`btn btn-sm ${bgType === opt.value ? 'active' : ''} justify-start gap-2`}
                  onClick={() => updateCanvasMeta({ backgroundType: opt.value })}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={opt.icon} />
                  </svg>
                  <span className="text-xs">{opt.label}</span>
                </button>
              ))}
            </div>
          </Popover>

          <button
            className={`btn btn-icon btn-sm ${mindMapMode ? 'active' : ''}`}
            onClick={() => setMindMapMode(!mindMapMode)}
            title="思维导图模式 (Tab/Enter添加节点)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="4" r="2" />
              <circle cx="5" cy="20" r="2" />
              <circle cx="19" cy="20" r="2" />
              <path d="M12 6v6M12 12l-7 6M12 12l7 6" />
            </svg>
          </button>
        </div>

        <div className="h-6 w-px bg-slate-200 mx-1" />

        <div className="toolbar">
          <NotificationBell />

          {currentUser ? (
            <div className="relative group ml-1">
              <div
                className="w-8 h-8 rounded-full cursor-pointer flex items-center justify-center text-white font-semibold text-xs ring-2 ring-white shadow-sm"
                style={{ background: currentUser.color || '#6366F1' }}
                title={currentUser.username}
              >
                {(currentUser.username || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl shadow-slate-200/50 border border-slate-100 py-1 z-50 hidden group-hover:block">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-700 truncate">{currentUser.username}</p>
                  <p className="text-xs text-slate-400 truncate">{currentUser.email}</p>
                </div>
                <button
                  className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                  onClick={() => navigate('/dashboard')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M20 14v7h-7" /></svg>
                  我的画布
                </button>
                <button
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  onClick={() => {
                    authApi.logout();
                    setCurrentUser(null);
                    navigate('/login', { replace: true });
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                  退出登录
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-sm font-medium"
              onClick={() => navigate('/login')}
            >
              登录
            </button>
          )}
        </div>

        <div className="h-6 w-px bg-slate-200 mx-1" />

        <div className="toolbar">
          <button
            className="btn btn-sm gap-1"
            onClick={handleSave}
            title="保存"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8" />
            </svg>
            保存
          </button>

          <Popover open={false} onClose={() => {}} trigger={
            <button
              className="btn btn-sm gap-1"
              title="导出"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              导出
            </button>
          }>
            <div className="flex flex-col gap-1 p-1">
              <button className="btn btn-sm justify-start gap-2" onClick={handleExport}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
                JSON 格式
              </button>
              <button className="btn btn-sm justify-start gap-2 opacity-50" disabled>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                PNG 图片
              </button>
              <button className="btn btn-sm justify-start gap-2 opacity-50" disabled>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6"/></svg>
                PDF 文档
              </button>
            </div>
          </Popover>
        </div>
      </div>
    </div>
  );
};

export default MainToolbar;
