import React, { useState, useRef, useEffect } from 'react';
import './ColumnFilter.css';

function ColumnFilter({ columnKey, columnLabel, allValues, currentFilter, onApplyFilter }) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterValue, setFilterValue] = useState(currentFilter || '');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleApply = () => {
    onApplyFilter(columnKey, filterValue);
    setIsOpen(false);
  };

  const handleClear = () => {
    setFilterValue('');
    onApplyFilter(columnKey, '');
    setIsOpen(false);
  };

  const uniqueValues = [...new Set(allValues.filter(v => v !== null && v !== undefined && v !== '' && v !== '-'))]
    .sort()
    .slice(0, 100);

  const hasActiveFilter = currentFilter && currentFilter !== '';

  return (
    <div className="column-filter" ref={dropdownRef}>
      <div className="filter-header">
        <span className="column-label">{columnLabel}</span>
        <button 
          className={`filter-toggle ${hasActiveFilter ? 'active' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
          title="Фильтр"
        >
          ▼
        </button>
      </div>
      
      {isOpen && (
        <div className="filter-dropdown">
          <div className="filter-input-wrapper">
            <input
              type="text"
              className="filter-input"
              placeholder="Введите или выберите..."
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              list={`${columnKey}-datalist`}
              autoFocus
            />
            <datalist id={`${columnKey}-datalist`}>
              {uniqueValues.map((value, index) => (
                <option key={index} value={value} />
              ))}
            </datalist>
          </div>
          
          {uniqueValues.length > 0 && (
            <div className="filter-values-list">
              {uniqueValues.map((value, index) => (
                <div 
                  key={index} 
                  className="filter-value-item"
                  onClick={() => setFilterValue(value)}
                >
                  {value}
                </div>
              ))}
            </div>
          )}
          
          <div className="filter-actions">
            <button className="filter-btn apply" onClick={handleApply}>
              Применить
            </button>
            <button className="filter-btn clear" onClick={handleClear}>
              Очистить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ColumnFilter;