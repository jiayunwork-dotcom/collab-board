import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { CanvasElement } from '@/types';
import { useCanvasStore } from '@/store/canvasStore';
import { screenToWorld, worldToScreen } from '@/canvas/geometry';
import { DEFAULT_COLORS, FONT_SIZES } from '@/utils';

export interface TextEditorProps {
  element: CanvasElement;
  viewport: { x: number; y: number; zoom: number };
  containerRef: React.RefObject<HTMLElement>;
  onFinish: (text: string, data: Partial<CanvasElement['data']>) => void;
  onCancel: () => void;
}

const PRESET_COLORS = DEFAULT_COLORS.filter(c => c !== '#FFFFFF');

export const TextEditor: React.FC<TextEditorProps> = ({
  element,
  viewport,
  containerRef,
  onFinish,
  onCancel,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [showToolbar, setShowToolbar] = useState(true);
  const [localText, setLocalText] = useState(element.data?.text || '');

  const setStrokeColor = useCanvasStore(s => s.setStrokeColor);

  const data = element.data || {};
  const fontSize = data.fontSize || 16;
  const color = data.color || data.strokeColor || '#0F172A';
  const fontFamily = data.fontFamily || `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`;
  const align = data.align || (element.type === 'text' ? 'left' : 'center');

  const screenPos = worldToScreen(element.x, element.y, viewport);
  const padX = 12;
  const padY = 8;

  const editorStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${screenPos.x + padX - 2}px`,
    top: `${screenPos.y + padY - 2}px`,
    width: `${(element.width - padX * 2 + 4) * viewport.zoom}px`,
    minHeight: `${(element.height - padY * 2 + 4) * viewport.zoom}px`,
    padding: 0,
    border: '2px solid #6366F1',
    borderRadius: '4px',
    background: element.type === 'sticky_note' ? (data.noteColor || '#FEF3C7') : '#FFFFFF',
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
    zIndex: 10000,
    outline: 'none',
    overflow: 'hidden',
    wordWrap: 'break-word',
    whiteSpace: 'pre-wrap',
    lineHeight: 1.3,
    textAlign: align,
    fontSize: `${fontSize * viewport.zoom}px`,
    color: color,
    fontFamily: fontFamily,
    fontWeight: data.bold ? 'bold' : 'normal',
    fontStyle: data.italic ? 'italic' : 'normal',
    textDecoration: data.underline ? 'underline' : 'none',
    cursor: 'text',
    boxSizing: 'border-box',
  };

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      setLocalText(editorRef.current.innerText);
    }
  }, []);

  const getCurrentFormat = useCallback(() => {
    return {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    };
  }, []);

  const [formatState, setFormatState] = useState({
    bold: !!data.bold,
    italic: !!data.italic,
    underline: !!data.underline,
  });

  const [currentColor, setCurrentColor] = useState(color);
  const [currentFontSize, setCurrentFontSize] = useState(fontSize);
  const [currentAlign, setCurrentAlign] = useState<'left' | 'center' | 'right'>(align as any);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    setLocalText(editorRef.current.innerText);
    setFormatState(getCurrentFormat());
  }, [getCurrentFormat]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      commitChanges();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (element.type === 'sticky_note' || element.type === 'mindnode') {
        e.preventDefault();
        document.execCommand('insertText', false, '\n');
        handleInput();
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      execCommand('bold');
      setFormatState(s => ({ ...s, bold: !s.bold }));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      execCommand('italic');
      setFormatState(s => ({ ...s, italic: !s.italic }));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
      e.preventDefault();
      execCommand('underline');
      setFormatState(s => ({ ...s, underline: !s.underline }));
    }
  }, [element.type, execCommand, handleInput, onCancel]);

  const commitChanges = useCallback(() => {
    const selection = window.getSelection();
    if (selection?.rangeCount) {
      selection.removeAllRanges();
    }
    const finalText = editorRef.current?.innerText || localText || '';
    onFinish(finalText.trim(), {
      bold: formatState.bold,
      italic: formatState.italic,
      underline: formatState.underline,
      color: currentColor,
      fontSize: currentFontSize,
      align: currentAlign,
    });
  }, [currentAlign, currentColor, currentFontSize, formatState, localText, onFinish]);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    const editor = editorRef.current;
    const toolbar = toolbarRef.current;
    if (!editor) return;
    if (!editor.contains(e.target as Node) && (!toolbar || !toolbar.contains(e.target as Node))) {
      commitChanges();
    }
  }, [commitChanges]);

  const handleColorChange = useCallback((newColor: string) => {
    setCurrentColor(newColor);
    setStrokeColor(newColor);
    execCommand('foreColor', newColor);
    setShowColorPicker(false);
  }, [execCommand, setStrokeColor]);

  const handleFontSizeChange = useCallback((size: number) => {
    setCurrentFontSize(size);
    if (editorRef.current) {
      editorRef.current.style.fontSize = `${size * viewport.zoom}px`;
    }
    setShowSizePicker(false);
  }, [viewport.zoom]);

  const handleAlignChange = useCallback((a: 'left' | 'center' | 'right') => {
    setCurrentAlign(a);
    if (editorRef.current) {
      editorRef.current.style.textAlign = a;
    }
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;

    editorRef.current.innerText = localText;

    setTimeout(() => {
      const ed = editorRef.current;
      if (!ed) return;
      ed.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      if (ed.childNodes.length > 0) {
        range.selectNodeContents(ed);
      } else {
        range.selectNode(ed);
      }
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }, 10);

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toolbarStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${screenPos.x}px`,
    top: `${Math.max(8, screenPos.y - 44)}px`,
    zIndex: 10001,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 10px',
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  };

  const btnBase: React.CSSProperties = {
    width: '28px',
    height: '28px',
    border: 'none',
    background: 'transparent',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    color: '#475569',
  };

  const ToolbarButton: React.FC<{ active?: boolean; onClick?: () => void; title?: string; children: React.ReactNode }> = ({
    active, onClick, title, children,
  }) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        ...btnBase,
        background: active ? '#EEF2FF' : 'transparent',
        color: active ? '#4F46E5' : '#475569',
        fontWeight: active ? 600 : 400,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );

  return (
    <>
      {showToolbar && (
        <div ref={toolbarRef} style={toolbarStyle} onMouseDown={(e) => e.preventDefault()}>
          <ToolbarButton
            title="粗体 (Ctrl+B)"
            active={formatState.bold}
            onClick={() => { execCommand('bold'); setFormatState(s => ({ ...s, bold: !s.bold })); }}
          >
            <span style={{ fontWeight: 'bold' }}>B</span>
          </ToolbarButton>
          <ToolbarButton
            title="斜体 (Ctrl+I)"
            active={formatState.italic}
            onClick={() => { execCommand('italic'); setFormatState(s => ({ ...s, italic: !s.italic })); }}
          >
            <span style={{ fontStyle: 'italic' }}>I</span>
          </ToolbarButton>
          <ToolbarButton
            title="下划线 (Ctrl+U)"
            active={formatState.underline}
            onClick={() => { execCommand('underline'); setFormatState(s => ({ ...s, underline: !s.underline })); }}
          >
            <span style={{ textDecoration: 'underline' }}>U</span>
          </ToolbarButton>

          <div style={{ width: '1px', height: '18px', background: '#E2E8F0', margin: '0 4px' }} />

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              title="字号"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setShowSizePicker(!showSizePicker); setShowColorPicker(false); }}
              style={{
                ...btnBase,
                width: 'auto',
                padding: '0 8px',
                gap: '4px',
                display: 'flex',
              }}
            >
              <span>{currentFontSize}</span>
              <span style={{ fontSize: '10px' }}>▼</span>
            </button>
            {showSizePicker && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  padding: '4px',
                  maxHeight: '240px',
                  overflowY: 'auto',
                  zIndex: 10002,
                }}
              >
                {FONT_SIZES.map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => handleFontSizeChange(size)}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '6px 12px',
                      border: 'none',
                      background: size === currentFontSize ? '#EEF2FF' : 'transparent',
                      color: size === currentFontSize ? '#4F46E5' : '#475569',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: `${size}px`,
                    }}
                  >
                    {size}px
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ width: '1px', height: '18px', background: '#E2E8F0', margin: '0 4px' }} />

          {(['left', 'center', 'right'] as const).map(a => (
            <ToolbarButton
              key={a}
              title={a === 'left' ? '左对齐' : a === 'center' ? '居中' : '右对齐'}
              active={currentAlign === a}
              onClick={() => handleAlignChange(a)}
            >
              {a === 'left' && '◀'}
              {a === 'center' && '◆'}
              {a === 'right' && '▶'}
            </ToolbarButton>
          ))}

          <div style={{ width: '1px', height: '18px', background: '#E2E8F0', margin: '0 4px' }} />

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              title="颜色"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setShowColorPicker(!showColorPicker); setShowSizePicker(false); }}
              style={{
                ...btnBase,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '3px',
                  background: currentColor,
                  border: currentColor === '#FFFFFF' ? '1px solid #CBD5E1' : 'none',
                }}
              />
              <span style={{ fontSize: '10px' }}>▼</span>
            </button>
            {showColorPicker && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  padding: '8px',
                  zIndex: 10002,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', marginBottom: '8px' }}>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleColorChange(c)}
                      style={{
                        width: '22px',
                        height: '22px',
                        border: c === currentColor ? '2px solid #6366F1' : '1px solid #E2E8F0',
                        borderRadius: '4px',
                        background: c,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="color"
                    value={currentColor}
                    onChange={(e) => handleColorChange(e.target.value)}
                    style={{ width: '32px', height: '28px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                  />
                  <input
                    type="text"
                    value={currentColor}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                        handleColorChange(val);
                      }
                    }}
                    style={{
                      width: '80px',
                      padding: '4px 6px',
                      border: '1px solid #E2E8F0',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        ref={editorRef}
        style={editorStyle}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          const r = e.relatedTarget as Node;
          if (toolbarRef.current?.contains(r)) {
            e.preventDefault();
            editorRef.current?.focus();
          }
        }}
      />
    </>
  );
};

export default TextEditor;
