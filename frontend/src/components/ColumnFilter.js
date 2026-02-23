import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import './ColumnFilter.css';

/**
 * ColumnFilter — дропдаун фильтра без кнопки.
 * Открывается через triggerEvent (SyntheticEvent или нативный MouseEvent),
 * который передаётся снаружи при правом клике на th.
 */
function ColumnFilter({ columnKey, allValues, currentFilter, onApplyFilter, triggerEvent }) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterValue, setFilterValue] = useState(currentFilter || '');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const dropdownRef = useRef(null);

  // Открываемся каждый раз когда triggerEvent меняется (новый клик)
  useEffect(() => {
    if (!triggerEvent) return;
    setDropdownPos({
      top: triggerEvent.clientY,
      left: triggerEvent.clientX,
    });
    setIsOpen(true);
  }, [triggerEvent]);

  useEffect(() => {
    setFilterValue(currentFilter || '');
  }, [currentFilter]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleApply = (value) => {
    const val = value !== undefined ? value : filterValue;
    onApplyFilter(columnKey, val);
    setIsOpen(false);
  };

  const handleClear = () => {
    setFilterValue('');
    onApplyFilter(columnKey, '');
    setIsOpen(false);
  };

  const uniqueValues = useMemo(() => {
    return [...new Set(allValues.filter(v => v !== null && v !== undefined && v !== '' && v !== '-'))]
      .sort()
      .slice(0, 100);
  }, [allValues]);

  const filteredValues = useMemo(() => {
    if (!filterValue || filterValue.trim() === '') return uniqueValues;
    return uniqueValues.filter(value =>
      String(value).toLowerCase().includes(filterValue.toLowerCase())
    );
  }, [uniqueValues, filterValue]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      ref={dropdownRef}
      className="filter-dropdown"
      style={{
        position: 'fixed',
        top: `${dropdownPos.top}px`,
        left: `${dropdownPos.left}px`,
        zIndex: 99999,
      }}
    >
      <div className="filter-input-wrapper">
        <input
          type="text"
          className="filter-input"
          placeholder="Введите или выберите..."
          value={filterValue}
          onChange={(e) => setFilterValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleApply(); if (e.key === 'Escape') setIsOpen(false); }}
          autoFocus
        />
      </div>

      {filteredValues.length > 0 && (
        <div className="filter-values-list">
          {filteredValues.map((value, index) => (
            <div
              key={index}
              className={`filter-value-item${String(value) === currentFilter ? ' selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setFilterValue(String(value));
                handleApply(String(value));
              }}
            >
              {value}
            </div>
          ))}
        </div>
      )}

      {filteredValues.length === 0 && filterValue && (
        <div className="filter-no-results">Ничего не найдено</div>
      )}

      <div className="filter-actions">
        <button className="filter-btn apply" onMouseDown={(e) => { e.preventDefault(); handleApply(); }}>
          Применить
        </button>
        <button className="filter-btn clear" onMouseDown={(e) => { e.preventDefault(); handleClear(); }}>
          Очистить
        </button>
      </div>
    </div>,
    document.body
  );
}

export default ColumnFilter;
