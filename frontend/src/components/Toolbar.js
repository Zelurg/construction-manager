import React, { useRef } from 'react';
import { scheduleAPI } from '../services/api';
import './Toolbar.css';

/**
 * Toolbar получает все действия через пропсы из App.js.
 * Логика импорта/экспорта остаётся в App.js, где знает текущий проект.
 */
function Toolbar({
  activeTab,
  showGantt,
  onToggleGantt,
  onShowColumnSettings,
  onShowFilters,
  onScheduleCleared,
  onDownloadTemplate,
  onUploadTemplate,
}) {
  const fileInputRef = useRef(null);

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (onUploadTemplate) await onUploadTemplate(file);
    event.target.value = '';
  };

  const handleClearSchedule = async () => {
    if (!window.confirm('Вы уверены, что хотите очистить весь график? Это действие нельзя отменить!')) return;
    try {
      await scheduleAPI.clearAll();
      alert('График успешно очищен');
      if (onScheduleCleared) onScheduleCleared();
    } catch (error) {
      alert('Ошибка при очистке графика');
      console.error(error);
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        {activeTab === 'schedule' && (
          <>
            <button
              onClick={onDownloadTemplate}
              className="toolbar-btn"
              title="Скачать / экспортировать график"
            >
              📥 Скачать шаблон
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="toolbar-btn"
              title="Загрузить график"
            >
              📤 Загрузить график
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button
              onClick={handleClearSchedule}
              className="toolbar-btn toolbar-btn-danger"
              title="Очистить весь график"
            >
              🗑️ Очистить график
            </button>
          </>
        )}
      </div>

      <div className="toolbar-right">
        {(activeTab === 'schedule' || activeTab === 'monthly') && (
          <button onClick={onShowFilters} className="toolbar-btn" title="Управление фильтрами">
            🔍 Фильтры
          </button>
        )}
        {(activeTab === 'schedule' || activeTab === 'monthly' || activeTab === 'daily') && (
          <button onClick={onShowColumnSettings} className="toolbar-btn" title="Настройка колонок">
            ⚙️ Колонки
          </button>
        )}
        {(activeTab === 'schedule' || activeTab === 'monthly') && (
          <button
            onClick={onToggleGantt}
            className={`toolbar-btn ${showGantt ? 'active' : ''}`}
            title={showGantt ? 'Скрыть диаграмму Ганта' : 'Показать диаграмму Ганта'}
          >
            📊 {showGantt ? 'Скрыть' : 'Показать'} Ганта
          </button>
        )}
      </div>
    </div>
  );
}

export default Toolbar;
