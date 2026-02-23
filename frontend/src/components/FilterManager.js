import React, { useState, useMemo } from 'react';
import './FilterManager.css';

function FilterManager({
  activeFilters,
  onClearAll,
  onClose,
  // пресеты (только в Schedule)
  monthPreset,
  onMonthPresetChange,
  overduePreset,
  onOverduePresetChange,
  completionPreset,
  onCompletionPresetChange,
  executorPreset,
  onExecutorPresetChange,
  employees,          // массив { id, full_name } для поиска
}) {
  const hasPresets = Boolean(onMonthPresetChange);
  const activeFilterCount = Object.values(activeFilters).filter(v => v && v.trim() !== '').length;

  // Локальный стейт поиска исполнителя
  const [executorQuery, setExecutorQuery] = useState(executorPreset || '');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useMemo(() => {
    if (!employees || !executorQuery.trim()) return [];
    const q = executorQuery.toLowerCase();
    return employees
      .filter(e => e.full_name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [employees, executorQuery]);

  const handleExecutorSelect = (name) => {
    setExecutorQuery(name);
    setShowSuggestions(false);
    if (onExecutorPresetChange) onExecutorPresetChange(name);
  };

  const handleExecutorClear = () => {
    setExecutorQuery('');
    setShowSuggestions(false);
    if (onExecutorPresetChange) onExecutorPresetChange(null);
  };

  const handleExecutorInput = (val) => {
    setExecutorQuery(val);
    setShowSuggestions(true);
    // Если поле очищено — сбрасываем пресет
    if (!val.trim() && onExecutorPresetChange) onExecutorPresetChange(null);
  };

  return (
    <div className="filter-manager-overlay" onClick={onClose}>
      <div className="filter-manager-modal" onClick={(e) => e.stopPropagation()}>
        <div className="filter-manager-header">
          <h3>🔍 Управление фильтрами</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="filter-manager-content">
          <div className="filter-stats">
            <p>Активных фильтров: <strong>{activeFilterCount}</strong></p>
          </div>

          {activeFilterCount > 0 && (
            <div className="active-filters-list">
              <h4>Активные фильтры:</h4>
              {Object.entries(activeFilters).map(([key, value]) =>
                value && value.trim() !== '' ? (
                  <div key={key} className="active-filter-item">
                    <span className="filter-key">{key}:</span>
                    <span className="filter-value">{value}</span>
                  </div>
                ) : null
              )}
            </div>
          )}

          <div className="filter-actions">
            <button
              className="clear-all-btn"
              onClick={onClearAll}
              disabled={activeFilterCount === 0}
            >
              🗑️ Очистить все фильтры
            </button>
          </div>

          {/* ─── ПРЕСЕТЫ ────────────────────────────────── */}
          {hasPresets ? (
            <div className="filter-presets">
              <h4>Пресеты фильтров</h4>

              {/* ПРЕСЕТ 1: работы за месяц */}
              <div className="preset-item">
                <label className="preset-label">📅 Работы за месяц</label>
                <div className="preset-controls">
                  <input
                    type="month"
                    value={monthPreset || ''}
                    onChange={(e) => onMonthPresetChange(e.target.value || null)}
                    className="preset-month-input"
                  />
                  {monthPreset && (
                    <button className="preset-clear-btn" onClick={() => onMonthPresetChange(null)} title="Сбросить">×</button>
                  )}
                </div>
                <p className="preset-description">
                  Хотя бы один плановый день попадает в выбранный месяц.
                </p>
              </div>

              {/* ПРЕСЕТ 2: нарушены сроки */}
              <div className="preset-item">
                <label className="preset-label">⚠️ Нарушены сроки</label>
                <div className="preset-controls">
                  <label className="preset-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(overduePreset)}
                      onChange={(e) => onOverduePresetChange(e.target.checked ? true : null)}
                    />
                    <span>Показать просроченные</span>
                  </label>
                </div>
                <p className="preset-description">
                  Финиш план &lt; сегодняшней даты и остаток объёма &ne; 0.
                </p>
              </div>

              {/* ПРЕСЕТ 3: выполнение */}
              <div className="preset-item">
                <label className="preset-label">✅ Выполнение</label>
                <div className="preset-controls">
                  <label className="preset-radio">
                    <input type="radio" name="completion" value=""
                      checked={!completionPreset}
                      onChange={() => onCompletionPresetChange(null)} />
                    <span>Все</span>
                  </label>
                  <label className="preset-radio">
                    <input type="radio" name="completion" value="done"
                      checked={completionPreset === 'done'}
                      onChange={() => onCompletionPresetChange('done')} />
                    <span>Выполнено</span>
                  </label>
                  <label className="preset-radio">
                    <input type="radio" name="completion" value="undone"
                      checked={completionPreset === 'undone'}
                      onChange={() => onCompletionPresetChange('undone')} />
                    <span>Не выполнено</span>
                  </label>
                </div>
                <p className="preset-description">
                  Выполнено: остаток объёма = 0.
                </p>
              </div>

              {/* ПРЕСЕТ 4: исполнитель */}
              <div className="preset-item" style={{ position: 'relative' }}>
                <label className="preset-label">👤 Исполнитель</label>
                <div className="preset-controls">
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="text"
                      value={executorQuery}
                      onChange={(e) => handleExecutorInput(e.target.value)}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      placeholder="Начните вводить фамилию..."
                      className="preset-month-input"
                      style={{ width: '100%' }}
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <ul className="executor-suggestions">
                        {suggestions.map(emp => (
                          <li key={emp.id}
                            onMouseDown={() => handleExecutorSelect(emp.full_name)}
                          >
                            {emp.full_name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {executorQuery && (
                    <button className="preset-clear-btn" onMouseDown={handleExecutorClear} title="Сбросить">×</button>
                  )}
                </div>
                <p className="preset-description">
                  Поиск по фамилии из справочника сотрудников.
                </p>
              </div>

            </div>
          ) : (
            <div className="filter-presets">
              <h4>Пресеты фильтров</h4>
              <p className="presets-placeholder">Пресеты недоступны для этой вкладки.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FilterManager;
