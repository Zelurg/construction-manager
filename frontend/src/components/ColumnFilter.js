import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import './ColumnFilter.css';

function ColumnFilter({ columnKey, columnLabel, allValues, currentFilter, onApplyFilter }) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterValue, setFilterValue] = useState(currentFilter || '');
  // Позиция дропдауна в координатах viewport (для портала)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 250 });

  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  // Пересчитываем позицию дропдауна относительно кнопки
  const recalcPosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + window.scrollY,
      left: rect.left + window.scrollX,
      // Минимальная ширина дропдауна — 250px, но не меньше ширины колонки
      width: Math.max(rect.width, 250),
    });
  };

  // При открытии пересчитываем позицию и вешаем слушатели
  useEffect(() => {
    if (!isOpen) return;

    recalcPosition();

    // Закрываем при клике вне дропдауна
    const handleClickOutside = (event) => {
      const btn = buttonRef.current;
      const drop = dropdownRef.current;
      if (
        drop && !drop.contains(event.target) &&
        btn && !btn.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    // Пересчитываем при скролле/ресайзе — дропдаун должен
    // следовать за кнопкой при горизонтальном скролле таблицы
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

  // Синхронизируем filterValue с currentFilter снаружи
  useEffect(() => {
    setFilterValue(currentFilter || '');
  }, [currentFilter]);

  const handleApply = () => {
    onApplyFilter(columnKey, filterValue);
    setIsOpen(false);
  };

  const handleClear = () => {
    setFilterValue('');
    onApplyFilter(columnKey, '');
    setIsOpen(false);
  };

  const handleToggle = () => {
    setIsOpen(prev => !prev);
  };

  // Уникальные значения колонки
  const uniqueValues = useMemo(() => {
    return [...new Set(allValues.filter(v => v !== null && v !== undefined && v !== '' && v !== '-'))]
      .sort()
      .slice(0, 100);
  }, [allValues]);

  // Значения, отфильтрованные по введённому тексту
  const filteredValues = useMemo(() => {
    if (!filterValue || filterValue.trim() === '') return uniqueValues;
    return uniqueValues.filter(value =>
      String(value).toLowerCase().includes(filterValue.toLowerCase())
    );
  }, [uniqueValues, filterValue]);

  const hasActiveFilter = currentFilter && currentFilter !== '';

  // Дропдаун рендерим через портал в document.body, чтобы
  // он не обрезался overflow:hidden/auto родительских контейнеров
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
              className="filter-value-item"
              onMouseDown={(e) => {
                // onMouseDown вместо onClick — иначе blur на input
                // срабатывает раньше и закрывает дропдаун
                e.preventDefault();
                setFilterValue(String(value));
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
        onClick={handleToggle}
        title="Фильтр"
      >
        ▼
      </button>
      {dropdown}
    </div>
  );
}

export default ColumnFilter;
