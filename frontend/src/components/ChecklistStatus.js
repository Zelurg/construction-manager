import React, { useState, useRef, useEffect } from 'react';

const STATUS_OPTIONS = [
  { value: 'gray',   label: '\u2014 Не установлено', color: '#9e9e9e' },
  { value: 'red',    label: '\u2718 Не готово',         color: '#e53935' },
  { value: 'yellow', label: '\u26a0 В процессе',       color: '#f9a825' },
  { value: 'green',  label: '\u2714 Готово',            color: '#43a047' },
];

export const STATUS_COLOR = {
  gray:   '#9e9e9e',
  red:    '#e53935',
  yellow: '#f9a825',
  green:  '#43a047',
};

/**
 * Кружок статуса с выпадающим списком.
 * Props:
 *   value      - 'gray' | 'red' | 'yellow' | 'green'
 *   onChange   - (newValue) => void   (если undefined - редактирование заблокировано)
 *   label      - подпись (необязательно)
 *   size       - диаметр кружка в px (default: 16)
 */
export default function ChecklistStatus({ value = 'gray', onChange, label, size = 16 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const color = STATUS_COLOR[value] || STATUS_COLOR.gray;
  const canEdit = typeof onChange === 'function';

  // Закрываем по клику вне
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (val) => {
    setOpen(false);
    if (onChange) onChange(val);
  };

  return (
    <div
      ref={ref}
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, position: 'relative' }}
    >
      {label && (
        <span style={{ fontSize: 9, color: '#666', lineHeight: 1, whiteSpace: 'nowrap' }}>{label}</span>
      )}
      <div
        onClick={canEdit ? (e) => { e.stopPropagation(); setOpen(o => !o); } : undefined}
        title={canEdit ? 'Клик — сменить статус' : undefined}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: color,
          cursor: canEdit ? 'pointer' : 'default',
          border: '1.5px solid rgba(0,0,0,0.15)',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
      />
      {open && (
        <div style={{
          position: 'absolute',
          top: size + 6,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#fff',
          border: '1px solid #ddd',
          borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          zIndex: 9999,
          minWidth: 160,
          padding: '4px 0',
        }}>
          {STATUS_OPTIONS.map(opt => (
            <div
              key={opt.value}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(opt.value); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                cursor: 'pointer',
                background: opt.value === value ? '#f0f4ff' : 'transparent',
                fontWeight: opt.value === value ? 600 : 400,
              }}
            >
              <div style={{
                width: 12, height: 12,
                borderRadius: '50%',
                backgroundColor: opt.color,
                border: '1px solid rgba(0,0,0,0.15)',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 12, color: '#333' }}>{opt.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
