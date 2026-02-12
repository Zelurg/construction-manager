import React, { useState } from 'react';
import '../styles/ColumnSettings.css';

function ColumnSettings({ availableColumns, visibleColumns, onSave, onClose }) {
  const [selectedColumns, setSelectedColumns] = useState([...visibleColumns]);
  const [draggedIndex, setDraggedIndex] = useState(null);

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
  
  // Drag and Drop handlers
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const newColumns = [...selectedColumns];
    const draggedItem = newColumns[draggedIndex];
    
    // Удаляем элемент из старой позиции
    newColumns.splice(draggedIndex, 1);
    // Вставляем в новую позицию
    newColumns.splice(index, 0, draggedItem);
    
    setSelectedColumns(newColumns);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };
  
  const moveUp = (index) => {
    if (index === 0) return;
    const newColumns = [...selectedColumns];
    [newColumns[index - 1], newColumns[index]] = [newColumns[index], newColumns[index - 1]];
    setSelectedColumns(newColumns);
  };
  
  const moveDown = (index) => {
    if (index === selectedColumns.length - 1) return;
    const newColumns = [...selectedColumns];
    [newColumns[index], newColumns[index + 1]] = [newColumns[index + 1], newColumns[index]];
    setSelectedColumns(newColumns);
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

        <div className="column-settings-sections">
          {/* Левая секция - доступные колонки */}
          <div className="column-settings-available">
            <h4>Доступные колонки</h4>
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
          </div>
          
          {/* Правая секция - выбранные колонки с порядком */}
          <div className="column-settings-selected">
            <h4>Порядок отображения ({selectedColumns.length})</h4>
            <div className="column-settings-order-list">
              {selectedColumns.length === 0 ? (
                <div className="empty-state">Выберите колонки слева</div>
              ) : (
                selectedColumns.map((columnKey, index) => {
                  const column = availableColumns.find(col => col.key === columnKey);
                  return (
                    <div
                      key={columnKey}
                      className={`column-order-item ${draggedIndex === index ? 'dragging' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="column-order-info">
                        <span className="drag-handle">⋮⋮</span>
                        <span className="column-number">{index + 1}.</span>
                        <span className="column-label">{column?.label || columnKey}</span>
                      </div>
                      <div className="column-order-controls">
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => moveUp(index)}
                          disabled={index === 0}
                          title="Переместить вверх"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => moveDown(index)}
                          disabled={index === selectedColumns.length - 1}
                          title="Переместить вниз"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          className="btn-icon btn-remove"
                          onClick={() => handleToggle(columnKey)}
                          title="Удалить из списка"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
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
