import React, { useState, useRef, useEffect } from 'react';
import { STROKE_WIDTHS } from '@/utils';

export interface StrokeWidthPickerProps {
  value: number;
  onChange: (width: number) => void;
  widths?: number[];
  label?: string;
  showCustom?: boolean;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  min?: number;
  max?: number;
  step?: number;
}

export const StrokeWidthPicker: React.FC<StrokeWidthPickerProps> = ({
  value,
  onChange,
  widths,
  label,
  showCustom = true,
  color = '#0F172A',
  size = 'md',
  min = 1,
  max = 40,
  step = 1,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customValue, setCustomValue] = useState<number>(value);
  const containerRef = useRef<HTMLDivElement>(null);

  const presets = widths || STROKE_WIDTHS;

  useEffect(() => {
    setCustomValue(value);
  }, [value]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const btnSize = size === 'sm' ? 28 : size === 'lg' ? 44 : 36;
  const previewW = size === 'sm' ? 22 : size === 'lg' ? 34 : 28;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        title={label || `线条粗细: ${value}px`}
        onClick={() => setIsOpen(!isOpen)}
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
          minWidth: size === 'sm' ? '44px' : '52px',
          justifyContent: 'center',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#94A3B8'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; }}
      >
        <div
          style={{
            width: `${previewW}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px 0',
          }}
        >
          <div
            style={{
              width: '100%',
              height: `${Math.min(value, 10)}px`,
              background: color,
              borderRadius: '2px',
            }}
          />
        </div>
        <span style={{
          fontSize: size === 'sm' ? '10px' : '11px',
          color: '#64748B',
          display: 'flex',
          alignItems: 'center',
          fontWeight: 500,
        }}>
          {value}
          <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" style={{ marginLeft: '2px' }}>
            <path d="M2 4 L5 7 L8 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
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
            minWidth: size === 'sm' ? '180px' : '220px',
          }}
        >
          {label && (
            <div style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#0F172A',
              marginBottom: '10px',
            }}>
              {label}
            </div>
          )}

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            marginBottom: showCustom ? '12px' : '0',
          }}>
            {presets.map(w => {
              const isSelected = w === value;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => { onChange(w); setIsOpen(false); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '6px 8px',
                    border: 'none',
                    borderRadius: '6px',
                    background: isSelected ? '#EEF2FF' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = '#F8FAFC';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isSelected ? '#EEF2FF' : 'transparent';
                  }}
                >
                  <div style={{
                    flex: 1,
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                  }}>
                    <div style={{
                      width: '100%',
                      height: `${w}px`,
                      background: color,
                      borderRadius: '999px',
                      boxShadow: isSelected ? `0 0 0 1px #6366F1` : 'none',
                    }} />
                  </div>
                  <span style={{
                    fontSize: '12px',
                    color: isSelected ? '#4F46E5' : '#475569',
                    fontWeight: isSelected ? 600 : 400,
                    width: '32px',
                    textAlign: 'right',
                  }}>
                    {w}px
                  </span>
                </button>
              );
            })}
          </div>

          {showCustom && (
            <div
              style={{
                borderTop: '1px solid #F1F5F9',
                paddingTop: '10px',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '8px',
              }}>
                <span style={{ fontSize: '11px', color: '#64748B', flex: 1 }}>自定义</span>
                <input
                  type="number"
                  value={customValue}
                  min={min}
                  max={max}
                  step={step}
                  onChange={(e) => {
                    const v = Math.max(min, Math.min(max, Number(e.target.value) || min));
                    setCustomValue(v);
                  }}
                  onBlur={() => {
                    if (customValue !== value) {
                      onChange(customValue);
                      setIsOpen(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (customValue !== value) {
                        onChange(customValue);
                      }
                      setIsOpen(false);
                    }
                  }}
                  style={{
                    width: '56px',
                    height: '28px',
                    padding: '0 6px',
                    border: '1px solid #E2E8F0',
                    borderRadius: '6px',
                    fontSize: '12px',
                    textAlign: 'center',
                    outline: 'none',
                  }}
                />
              </div>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={customValue}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setCustomValue(v);
                  onChange(v);
                }}
                style={{
                  width: '100%',
                  cursor: 'pointer',
                  accentColor: '#6366F1',
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StrokeWidthPicker;
