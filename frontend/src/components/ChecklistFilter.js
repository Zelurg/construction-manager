import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { STATUS_COLOR } from './ChecklistStatus';

const STATUS_OPTIONS = [
  { value: '',       label: 'Все',              color: null },
  { value: 'gray',   label: 'Не установлено', color: STATUS_COLOR.gray },
  { value: 'red',    label: 'Не готово',       color: STATUS_COLOR.red },
  { value: 'yellow', label: 'В процессе',     color: STATUS_COLOR.yellow },
  { value: 'green',  label: 'Готово',          color: STATUS_COLOR.green },
];

/**
 * Фильтр для колонок чек-листа. Открывается по triggerEvent (правый клик на th).
 * Применяет onApplyFilter(colKey, value) где value в {'gray','red','yellow','green',''}
 */
function ChecklistFilter({ columnKey, currentFilter, onApplyFilter, triggerEvent }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!triggerEvent) return;
    setPos({ top: triggerEvent.clientY, left: triggerEvent.clientX });
    setIsOpen(true);
  }, [triggerEvent]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        zIndex: 99999,
        minWidth: 170,
        padding: '4px 0',
      }}
    >
      <div style={{ padding: '6px 12px 4px', fontSize: 11, color: '#888', borderBottom: '1px solid #eee', marginBottom: 2 }}>
        Фильтр по статусу
      </div>
      {STATUS_OPTIONS.map(opt => (
        <div
          key={opt.value}
          onMouseDown={(e) => {
            e.preventDefault();
            onApplyFilter(columnKey, opt.value);
            setIsOpen(false);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 14px',
            cursor: 'pointer',
            background: opt.value === currentFilter ? '#f0f4ff' : 'transparent',
            fontWeight: opt.value === currentFilter ? 600 : 400,
          }}
        >
          {opt.color ? (
            <div style={{
              width: 13, height: 13, borderRadius: '50%',
              backgroundColor: opt.color,
              border: '1px solid rgba(0,0,0,0.15)',
              flexShrink: 0,
            }} />
          ) : (
            <div style={{ width: 13, height: 13, flexShrink: 0 }} />
          )}
          <span style={{ fontSize: 12, color: '#333' }}>{opt.label}</span>
          {opt.value === currentFilter && opt.value !== '' && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4a90e2' }}>✔</span>
          )}
        </div>
      ))}
    </div>,
    document.body
  );
}

export default ChecklistFilter;
