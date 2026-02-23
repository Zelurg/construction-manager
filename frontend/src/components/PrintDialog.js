import React, { useState } from 'react';
import './PrintDialog.css';

const SCALES = [
  { value: 'year',    label: 'Год    (1 px/день)' },
  { value: 'quarter', label: 'Квартал (3 px/день)' },
  { value: 'month',   label: 'Месяц  (5 px/день)' },
  { value: 'week',    label: 'Неделя (15 px/день)' },
  { value: 'day',     label: 'День   (60 px/день)' },
];

/**
 * availableColumns — массив { key, label }
 * defaultVisible   — массив ключей, которые уже видны в таблице
 * onPrint(selectedCols, ganttScale) — коллбэк
 */
function PrintDialog({ availableColumns, defaultVisible, includeGantt, onPrint, onClose }) {
  const [selectedCols, setSelectedCols] = useState(new Set(defaultVisible));
  const [ganttScale, setGanttScale] = useState(
    localStorage.getItem('ganttScale') || 'month'
  );

  const toggleCol = (key) => {
    setSelectedCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const selectAll   = () => setSelectedCols(new Set(availableColumns.map(c => c.key)));
  const deselectAll = () => setSelectedCols(new Set());

  const handlePrint = () => {
    if (selectedCols.size === 0) {
      alert('Выберите хотя бы одну колонку');
      return;
    }
    // сохраняем выбранный масштаб для Ганта
    localStorage.setItem('ganttScale', ganttScale);
    onPrint(Array.from(selectedCols), ganttScale);
  };

  return (
    <div className="print-dialog-overlay" onClick={onClose}>
      <div className="print-dialog-modal" onClick={e => e.stopPropagation()}>
        <div className="print-dialog-header">
          <h3>🖨️ Печать МСГ</h3>
          <button className="pd-close" onClick={onClose}>×</button>
        </div>

        <div className="print-dialog-body">
          {/* ── Колонки ── */}
          <div className="pd-section">
            <div className="pd-section-title">Колонки таблицы</div>
            <div className="pd-col-actions">
              <button className="pd-link" onClick={selectAll}>Выбрать все</button>
              <button className="pd-link" onClick={deselectAll}>Снять все</button>
            </div>
            <div className="pd-columns-grid">
              {availableColumns.map(col => (
                <label key={col.key} className="pd-col-item">
                  <input
                    type="checkbox"
                    checked={selectedCols.has(col.key)}
                    onChange={() => toggleCol(col.key)}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ── Масштаб Ганта ── */}
          {includeGantt && (
            <div className="pd-section">
              <div className="pd-section-title">Масштаб диаграммы Ганта</div>
              <div className="pd-scales">
                {SCALES.map(s => (
                  <label key={s.value} className="pd-scale-item">
                    <input
                      type="radio"
                      name="ganttScale"
                      value={s.value}
                      checked={ganttScale === s.value}
                      onChange={() => setGanttScale(s.value)}
                    />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="print-dialog-footer">
          <button className="pd-btn-cancel" onClick={onClose}>Отмена</button>
          <button className="pd-btn-print" onClick={handlePrint}>🖨️ Печать</button>
        </div>
      </div>
    </div>
  );
}

export default PrintDialog;
