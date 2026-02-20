import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import './ColumnFilter.css';

function ColumnFilter({ columnKey, columnLabel, allValues, currentFilter, onApplyFilter }) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterValue, setFilterValue] = useState(currentFilter || '');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 250 });

  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  const recalcPosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom,
      left: rect.left,
      width: Math.max(rect.width, 250),
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    recalcPosition();
    const handleClickOutside = (event) => {
      const btn = buttonRef.current;
      const drop = dropdownRef.current;
      if (drop && !drop.contains(event.target) && btn && !btn.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleScrollResize = () => recalcPosition();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScrollResize, true);
    window.addEventListener('resize', handleScrollResize);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollResize, true);
      window.removeEventListener('resize', handleScrollResize);
    };
  }, [isOpen]);

  useEffect(() => {
    setFilterValue(currentFilter || '');
  }, [currentFilter]);

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

  const hasActiveFilter = currentFilter && currentFilter !== '';

  const dropdown = isOpen ? ReactDOM.createPortal(
    <div
      ref={dropdownRef}
      className="filter-dropdown"
      style={{
        position: 'fixed',
        top: `${dropdownPos.top}px`,
        left: `${dropdownPos.left}px`,
        minWidth: `${dropdownPos.width}px`,
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
          onKeyDown={(e) => { if (e.key === 'Enter') handleApply(); }}
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
                // Сразу применяем фильтр при клике на пункт списка
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
  ) : null;

  return (
    <div className="column-filter">
      <button
        ref={buttonRef}
        className={`filter-toggle ${hasActiveFilter ? 'active' : ''}`}
        onClick={() => setIsOpen(prev => !prev)}
        title="Фильтр"
      >
        ▼
      </button>
      {dropdown}
    </div>
  );
}

export default ColumnFilter;
