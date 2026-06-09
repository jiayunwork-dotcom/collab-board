import React, { useState, useRef, useEffect } from 'react';
import { FONT_SIZES } from '@/utils';

export interface FontSizePickerProps {
  value: number;
  onChange: (size: number) => void;
  sizes?: number[];
  label?: string;
  showCustom?: boolean;
  size?: 'sm' | 'md' | 'lg';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export const FontSizePicker: React.FC<FontSizePickerProps> = ({
  value,
  onChange,
  sizes,
  label,
  showCustom = true,
  size = 'md',
  min = 8,
  max = 128,
  step = 1,
  unit = 'px',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customValue, setCustomValue] = useState<number>(value);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const presets = sizes || FONT_SIZES;

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

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const btnSize = size === 'sm' ? 28 : size === 'lg' ? 44 : 36;

  const filteredPresets = searchTerm
    ? presets.filter(s => String(s).includes(searchTerm))
    : presets;

  const decrease = () => {
    const next = Math.max(min, value - step);
    if (next !== value) onChange(next);
  };

  const increase = () => {
    const next = Math.min(max, value + step);
    if (next !== value) onChange(next);
  };

  const iconBtnStyle: React.CSSProperties = {
    width: '22px',
    height: '22px',
    border: 'none',
    background: 'transparent',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#64748B',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 600,
    padding: 0,
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '6px',
          overflow: 'hidden',
          height: `${btnSize}px`,
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#94A3B8'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; }}
      >
        <button
          type="button"
          onClick={decrease}
          title="减小字号"
          style={iconBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          title={label || `字号: ${value}${unit}`}
          style={{
            height: '100%',
            padding: `0 ${size === 'sm' ? '6px' : '10px'}`,
            border: 'none',
            borderLeft: '1px solid #F1F5F9',
            borderRight: '1px solid #F1F5F9',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: size === 'sm' ? '11px' : '12px',
            fontWeight: 500,
            color: '#334155',
            minWidth: size === 'sm' ? '44px' : '52px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
          }}
        >
          <span>{value}</span>
          <span style={{ color: '#94A3B8', fontSize: size === 'sm' ? '9px' : '10px' }}>
            {unit}
          </span>
        </button>
        <button
          type="button"
          onClick={increase}
          title="增大字号"
          style={iconBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          +
        </button>
      </div>

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
            padding: '10px',
            zIndex: 9999,
            minWidth: size === 'sm' ? '140px' : '170px',
          }}
        >
          {label && (
            <div style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#0F172A',
              marginBottom: '8px',
            }}>
              {label}
            </div>
          )}

          {showCustom && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '8px',
              paddingBottom: '8px',
              borderBottom: '1px solid #F1F5F9',
            }}>
              <input
                ref={inputRef}
                type="text"
                value={searchTerm || customValue}
                placeholder="输入..."
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, '');
                  setSearchTerm(v);
                  const n = Number(v);
                  if (!isNaN(n)) {
                    setCustomValue(Math.max(min, Math.min(max, n)));
                  }
                }}
                onBlur={() => {
                  if (searchTerm && !isNaN(Number(searchTerm))) {
                    const n = Math.max(min, Math.min(max, Number(searchTerm)));
                    if (n !== value) onChange(n);
                  }
                  setSearchTerm('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (searchTerm && !isNaN(Number(searchTerm))) {
                      const n = Math.max(min, Math.min(max, Number(searchTerm)));
                      if (n !== value) onChange(n);
                    }
                    setIsOpen(false);
                    setSearchTerm('');
                  }
                }}
                style={{
                  flex: 1,
                  height: '28px',
                  padding: '0 8px',
                  border: '1px solid #E2E8F0',
                  borderRadius: '6px',
                  fontSize: '12px',
                  outline: 'none',
                  minWidth: 0,
                }}
              />
              <span style={{
                fontSize: '11px',
                color: '#94A3B8',
                flexShrink: 0,
              }}>
                {unit}
              </span>
            </div>
          )}

          <div style={{
            maxHeight: '220px',
            overflowY: 'auto',
            marginRight: '-4px',
            paddingRight: '4px',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {filteredPresets.map(s => {
                const isSelected = s === value;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { onChange(s); setIsOpen(false); }}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '10px',
                      padding: '6px 8px',
                      border: 'none',
                      borderRadius: '5px',
                      background: isSelected ? '#EEF2FF' : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = '#F8FAFC';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isSelected ? '#EEF2FF' : 'transparent';
                    }}
                  >
                    <span style={{
                      fontSize: `${Math.min(s, 24)}px`,
                      color: isSelected ? '#4F46E5' : '#0F172A',
                      fontWeight: 500,
                      lineHeight: 1.2,
                      width: size === 'sm' ? '28px' : '34px',
                      display: 'inline-block',
                    }}>
                      Aa
                    </span>
                    <span style={{
                      fontSize: '11px',
                      color: isSelected ? '#4F46E5' : '#64748B',
                      fontWeight: isSelected ? 600 : 400,
                    }}>
                      {s}{unit}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FontSizePicker;
