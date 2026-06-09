import React, { useState, useRef, useEffect } from 'react';
import { DEFAULT_COLORS } from '@/utils';

export interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  presetColors?: string[];
  allowNone?: boolean;
  noneLabel?: string;
  label?: string;
  compact?: boolean;
  showRecent?: boolean;
  maxRecent?: number;
  size?: 'sm' | 'md' | 'lg';
}

const RECENT_KEY = 'collab-color-recent';

export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  presetColors,
  allowNone = false,
  noneLabel = '无填充',
  label,
  compact = false,
  showRecent = true,
  maxRecent = 8,
  size = 'md',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const presets = presetColors || DEFAULT_COLORS;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    if (!value || value === 'transparent') return;
    setRecent(prev => {
      if (prev[0] === value) return prev;
      const next = [value, ...prev.filter(c => c !== value)].slice(0, maxRecent);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [value, maxRecent]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const swatchSize = size === 'sm' ? 20 : size === 'lg' ? 32 : 24;
  const swatchGap = compact ? 2 : 4;
  const cols = size === 'sm' ? 9 : size === 'lg' ? 6 : 9;

  const btnSize = size === 'sm' ? 28 : size === 'lg' ? 44 : 36;

  const Swatch: React.FC<{ color: string; onClick: () => void; isSelected?: boolean; title?: string }> = ({
    color, onClick, isSelected, title,
  }) => (
    <button
      type="button"
      title={title || color}
      onClick={() => { onClick(); setIsOpen(false); }}
      style={{
        width: `${swatchSize}px`,
        height: `${swatchSize}px`,
        padding: 0,
        border: isSelected ? '2px solid #6366F1' : color === '#FFFFFF' ? '1px solid #CBD5E1' : '1px solid rgba(0,0,0,0.08)',
        borderRadius: size === 'sm' ? '3px' : '5px',
        background: color === 'transparent'
          ? `repeating-conic-gradient(#f1f5f9 0% 25%, #fff 0% 50%) 50% / 12px 12px`
          : color,
        cursor: 'pointer',
        boxShadow: isSelected ? '0 0 0 2px #E0E7FF' : 'none',
        flexShrink: 0,
      }}
    />
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={label || value}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: size === 'sm' ? '2px 6px' : '4px 8px',
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '6px',
          cursor: 'pointer',
          height: `${btnSize}px`,
          minWidth: size === 'sm' ? '40px' : '48px',
          justifyContent: 'center',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#94A3B8';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#E2E8F0';
        }}
      >
        <div
          style={{
            width: size === 'sm' ? '18px' : '22px',
            height: size === 'sm' ? '18px' : '22px',
            borderRadius: '4px',
            background: value === 'transparent'
              ? `repeating-conic-gradient(#f1f5f9 0% 25%, #fff 0% 50%) 50% / 10px 10px`
              : value,
            border: value === '#FFFFFF' ? '1px solid #CBD5E1' : '1px solid rgba(0,0,0,0.08)',
          }}
        />
        {!compact && <span style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center' }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M2 4 L5 7 L8 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '6px',
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            boxShadow: '0 8px 32px rgba(15, 23, 42, 0.12), 0 2px 6px rgba(15, 23, 42, 0.06)',
            padding: '12px',
            zIndex: 9999,
            minWidth: size === 'sm' ? '220px' : '260px',
          }}
        >
          {label && (
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', marginBottom: '10px' }}>
              {label}
            </div>
          )}

          {showRecent && recent.length > 0 && (
            <>
              <div style={{ fontSize: '10px', color: '#94A3B8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                最近使用
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(recent.length, cols)}, ${swatchSize}px)`,
                  gap: `${swatchGap}px`,
                  marginBottom: '12px',
                }}
              >
                {recent.map((c, i) => (
                  <Swatch key={`r${i}`} color={c} onClick={() => onChange(c)} isSelected={c === value} />
                ))}
              </div>
            </>
          )}

          <div style={{ fontSize: '10px', color: '#94A3B8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            预设颜色
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, ${swatchSize}px)`,
              gap: `${swatchGap}px`,
              marginBottom: allowNone ? '12px' : '0',
            }}
          >
            {presets.map((c, i) => (
              <Swatch key={`p${i}`} color={c} onClick={() => onChange(c)} isSelected={c === value} />
            ))}
          </div>

          {allowNone && (
            <div style={{ marginBottom: '12px' }}>
              <Swatch
                color="transparent"
                onClick={() => onChange('transparent')}
                isSelected={value === 'transparent'}
                title={noneLabel}
              />
            </div>
          )}

          <div
            style={{
              borderTop: '1px solid #F1F5F9',
              paddingTop: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <input
              type="color"
              value={value === 'transparent' ? '#000000' : /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#000000'}
              onChange={(e) => onChange(e.target.value)}
              style={{
                width: '36px',
                height: '32px',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                background: 'transparent',
                cursor: 'pointer',
                padding: 0,
              }}
            />
            <input
              type="text"
              value={value}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (/^#[0-9A-Fa-f]{6}$/.test(v) || v === 'transparent') {
                  onChange(v);
                }
              }}
              placeholder="#RRGGBB"
              style={{
                flex: 1,
                height: '32px',
                padding: '0 8px',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                fontSize: '12px',
                fontFamily: 'Consolas, Monaco, monospace',
                outline: 'none',
              }}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ColorPicker;
