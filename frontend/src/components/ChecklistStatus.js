import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

const STATUS_OPTIONS = [
  { value: 'white',  label: '\u2014 \u041d\u0435 \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u043e', color: '#ffffff', border: '1.5px solid #bbb' },
  { value: 'gray',   label: '\u2014 \u041d\u0435 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044f',       color: '#9e9e9e', border: null },
  { value: 'red',    label: '\u2718 \u041d\u0435 \u0433\u043e\u0442\u043e\u0432\u043e',                         color: '#e53935', border: null },
  { value: 'yellow', label: '\u26a0 \u0412 \u043f\u0440\u043e\u0446\u0435\u0441\u0441\u0435',                   color: '#f9a825', border: null },
  { value: 'green',  label: '\u2714 \u0413\u043e\u0442\u043e\u0432\u043e',                                      color: '#43a047', border: null },
];

export const STATUS_COLOR = {
  white:  '#ffffff',
  gray:   '#9e9e9e',
  red:    '#e53935',
  yellow: '#f9a825',
  green:  '#43a047',
};

export default function ChecklistStatus({ value = 'white', onChange, label, size = 16 }) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const circleRef = useRef(null);

  const opt = STATUS_OPTIONS.find(o => o.value === value) || STATUS_OPTIONS[0];
  const color = opt.color;
  const circleBorder = opt.border || '1.5px solid rgba(0,0,0,0.18)';
  const canEdit = typeof onChange === 'function';

  const handleCircleClick = (e) => {
    if (!canEdit) return;
    e.stopPropagation();
    const rect = circleRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX - 60,
    });
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (circleRef.current && circleRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (val) => {
    setOpen(false);
    if (onChange) onChange(val);
  };

  const dropdown = open ? ReactDOM.createPortal(
    <div style={{
      position: 'absolute',
      top: dropdownPos.top,
      left: dropdownPos.left,
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: 6,
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      zIndex: 99999,
      minWidth: 175,
      padding: '4px 0',
    }}>
      {STATUS_OPTIONS.map(o => (
        <div
          key={o.value}
          onMouseDown={(e) => { e.preventDefault(); handleSelect(o.value); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 14px', cursor: 'pointer',
            background: o.value === value ? '#f0f4ff' : 'transparent',
            fontWeight: o.value === value ? 600 : 400,
          }}
        >
          <div style={{
            width: 13, height: 13, borderRadius: '50%',
            backgroundColor: o.color,
            border: o.border || '1px solid rgba(0,0,0,0.15)',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: '#333' }}>{o.label}</span>
        </div>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      {label && (
        <span style={{ fontSize: 9, color: '#555', lineHeight: 1, whiteSpace: 'nowrap' }}>{label}</span>
      )}
      <div
        ref={circleRef}
        onClick={handleCircleClick}
        title={canEdit ? '\u041a\u043b\u0438\u043a \u2014 \u0441\u043c\u0435\u043d\u0438\u0442\u044c \u0441\u0442\u0430\u0442\u0443\u0441' : opt.label}
        style={{
          width: size, height: size, borderRadius: '50%',
          backgroundColor: color,
          cursor: canEdit ? 'pointer' : 'default',
          border: circleBorder,
          flexShrink: 0, boxSizing: 'border-box',
          transition: 'transform 0.1s',
        }}
      />
      {dropdown}
    </div>
  );
}
