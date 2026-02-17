import React, { useState, useRef, useEffect, useMemo } from 'react';
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

  // Получаем уникальные значения
  const uniqueValues = useMemo(() => {
    return [...new Set(allValues.filter(v => v !== null && v !== undefined && v !== '' && v !== '-'))]
      .sort()
      .slice(0, 100);
  }, [allValues]);

  // Фильтруем список значений в зависимости от введённого текста
  const filteredValues = useMemo(() => {
    if (!filterValue || filterValue.trim() === '') {
      return uniqueValues;
    }
    return uniqueValues.filter(value => 
      String(value).toLowerCase().includes(filterValue.toLowerCase())
    );
  }, [uniqueValues, filterValue]);

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
              autoFocus
            />
          </div>
          
          {filteredValues.length > 0 && (
            <div className="filter-values-list">
              {filteredValues.map((value, index) => (
                <div 
                  key={index} 
                  className="filter-value-item"
                  onClick={() => setFilterValue(String(value))}
                >
                  {value}
                </div>
              ))}
            </div>
          )}
          
          {filteredValues.length === 0 && filterValue && (
            <div className="filter-no-results">
              Ничего не найдено
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