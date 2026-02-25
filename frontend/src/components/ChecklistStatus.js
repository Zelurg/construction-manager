import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

const STATUS_OPTIONS = [
  { value: 'gray',   label: '\u2014 \u041d\u0435 \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u043e', color: '#9e9e9e' },
  { value: 'red',    label: '\u2718 \u041d\u0435 \u0433\u043e\u0442\u043e\u0432\u043e',         color: '#e53935' },
  { value: 'yellow', label: '\u26a0 \u0412 \u043f\u0440\u043e\u0446\u0435\u0441\u0441\u0435',   color: '#f9a825' },
  { value: 'green',  label: '\u2714 \u0413\u043e\u0442\u043e\u0432\u043e',            color: '#43a047' },
];

export const STATUS_COLOR = {
  gray:   '#9e9e9e',
  red:    '#e53935',
  yellow: '#f9a825',
  green:  '#43a047',
};

/**
 * \u041a\u0440\u0443\u0436\u043e\u043a \u0441\u0442\u0430\u0442\u0443\u0441\u0430 \u0441 \u0432\u044b\u043f\u0430\u0434\u0430\u044e\u0449\u0438\u043c \u0441\u043f\u0438\u0441\u043a\u043e\u043c (portal \u2014 \u0440\u0435\u043d\u0434\u0435\u0440\u0438\u0442\u0441\u044f \u043d\u0430 document.body \u043f\u043e\u0432\u0435\u0440\u0445 \u0432\u0441\u0435\u0433\u043e).
 */
export default function ChecklistStatus({ value = 'gray', onChange, label, size = 16 }) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const circleRef = useRef(null);

  const color = STATUS_COLOR[value] || STATUS_COLOR.gray;
  const canEdit = typeof onChange === 'function';

  // \u0412\u044b\u0447\u0438\u0441\u043b\u044f\u0435\u043c \u043f\u043e\u0437\u0438\u0446\u0438\u044e \u043f\u043e\u043f\u0430\u043f\u0430 \u0440\u0435\u043b\u0430\u0442\u0438\u0432\u043d\u043e \u0432\u044c\u044e\u043f\u043e\u0440\u0442\u0430 (viewport)
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

  // \u0417\u0430\u043a\u0440\u044b\u0432\u0430\u0435\u043c \u043f\u043e \u043a\u043b\u0438\u043a\u0443 \u0432\u043d\u0435
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
    <div
      style={{
        position: 'absolute',
        top: dropdownPos.top,
        left: dropdownPos.left,
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        zIndex: 99999,
        minWidth: 170,
        padding: '4px 0',
      }}
    >
      {STATUS_OPTIONS.map(opt => (
        <div
          key={opt.value}
          onMouseDown={(e) => { e.preventDefault(); handleSelect(opt.value); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 14px',
            cursor: 'pointer',
            background: opt.value === value ? '#f0f4ff' : 'transparent',
            fontWeight: opt.value === value ? 600 : 400,
          }}
        >
          <div style={{
            width: 13, height: 13,
            borderRadius: '50%',
            backgroundColor: opt.color,
            border: '1px solid rgba(0,0,0,0.15)',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: '#333' }}>{opt.label}</span>
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
        title={canEdit ? '\u041a\u043b\u0438\u043a \u2014 \u0441\u043c\u0435\u043d\u0438\u0442\u044c \u0441\u0442\u0430\u0442\u0443\u0441' : STATUS_OPTIONS.find(o => o.value === value)?.label}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: color,
          cursor: canEdit ? 'pointer' : 'default',
          border: '1.5px solid rgba(0,0,0,0.18)',
          flexShrink: 0,
          boxSizing: 'border-box',
          transition: 'transform 0.1s',
        }}
      />
      {dropdown}
    </div>
  );
}
