import React from 'react';
import './FilterManager.css';

function FilterManager({ activeFilters, onClearAll, onClose, monthPreset, onMonthPresetChange }) {
  const activeFilterCount = Object.values(activeFilters).filter(v => v && v.trim() !== '').length;

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
              {Object.entries(activeFilters).map(([key, value]) => {
                if (value && value.trim() !== '') {
                  return (
                    <div key={key} className="active-filter-item">
                      <span className="filter-key">{key}:</span>
                      <span className="filter-value">{value}</span>
                    </div>
                  );
                }
                return null;
              })}
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

          <div className="filter-presets">
            <h4>Пресеты фильтров</h4>

            {/* Пресет по месяцу — показываем только если родитель передал onMonthPresetChange */}
            {onMonthPresetChange && (
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
                    <button
                      className="preset-clear-btn"
                      onClick={() => onMonthPresetChange(null)}
                      title="Сбросить пресет"
                    >
                      ×
                    </button>
                  )}
                </div>
                <p className="preset-description">
                  Показывает работы, у которых хотя бы один день плановых дат попадает в выбранный месяц.
                </p>
              </div>
            )}

            {!onMonthPresetChange && (
              <p className="presets-placeholder">Пресеты недоступны для этой вкладки.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FilterManager;
