import React from 'react';
import './FilterManager.css';

function FilterManager({ activeFilters, onClearAll, onClose }) {
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
            <p className="presets-placeholder">Функционал в разработке...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FilterManager;