import React, { useState } from 'react';
import '../styles/ColumnSettings.css';

function ColumnSettings({ availableColumns, visibleColumns, onSave, onClose }) {
  const [selectedColumns, setSelectedColumns] = useState([...visibleColumns]);

  const handleToggle = (columnKey) => {
    if (selectedColumns.includes(columnKey)) {
      setSelectedColumns(selectedColumns.filter(key => key !== columnKey));
    } else {
      setSelectedColumns([...selectedColumns, columnKey]);
    }
  };

  const handleSave = () => {
    onSave(selectedColumns);
    onClose();
  };

  const handleSelectAll = () => {
    setSelectedColumns(availableColumns.map(col => col.key));
  };

  const handleDeselectAll = () => {
    setSelectedColumns([]);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content column-settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Настройка отображаемых колонок</h3>
        
        <div className="column-settings-buttons">
          <button 
            type="button" 
            onClick={handleSelectAll}
            className="btn-secondary"
          >
            Выбрать все
          </button>
          <button 
            type="button" 
            onClick={handleDeselectAll}
            className="btn-secondary"
          >
            Снять все
          </button>
        </div>

        <div className="column-settings-list">
          {availableColumns.map(column => (
            <label key={column.key} className="column-checkbox">
              <input
                type="checkbox"
                checked={selectedColumns.includes(column.key)}
                onChange={() => handleToggle(column.key)}
              />
              <span>{column.label}</span>
            </label>
          ))}
        </div>

        <div className="modal-actions">
          <button 
            type="button" 
            onClick={onClose} 
            className="btn-cancel"
          >
            Отмена
          </button>
          <button 
            type="button" 
            onClick={handleSave} 
            className="btn-submit"
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}

export default ColumnSettings;
