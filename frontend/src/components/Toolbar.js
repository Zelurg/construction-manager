import React, { useRef } from 'react';
import { scheduleAPI } from '../services/api';
import './Toolbar.css';

function Toolbar({
  activeTab,
  showGantt,
  onToggleGantt,
  onShowColumnSettings,
  onShowFilters,
  onScheduleCleared,
  onDownloadSchedule,
  onUploadSchedule,
  onDownloadMSG,
  onUploadMSG,
  onPrint,
}) {
  const scheduleFileInputRef = useRef(null);
  const msgFileInputRef = useRef(null);

  const handleScheduleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (onUploadSchedule) await onUploadSchedule(file);
    event.target.value = '';
  };

  const handleMSGFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (onUploadMSG) await onUploadMSG(file);
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
            <button onClick={onDownloadSchedule} className="toolbar-btn" title="Скачать график со всеми атрибутами">
              📥 Скачать график
            </button>
            <button onClick={() => scheduleFileInputRef.current?.click()} className="toolbar-btn" title="Загрузить график">
              📤 Загрузить график
            </button>
            <input ref={scheduleFileInputRef} type="file" accept=".xlsx,.xls" onChange={handleScheduleFileChange} style={{ display: 'none' }} />
            <button onClick={handleClearSchedule} className="toolbar-btn toolbar-btn-danger" title="Очистить весь график">
              🗑️ Очистить график
            </button>
          </>
        )}
        {activeTab === 'monthly' && (
          <>
            <button onClick={onDownloadMSG} className="toolbar-btn" title="Скачать МСГ в Excel">
              📥 Скачать МСГ
            </button>
            <button onClick={() => msgFileInputRef.current?.click()} className="toolbar-btn" title="Загрузить МСГ из Excel">
              📤 Загрузить МСГ
            </button>
            <input ref={msgFileInputRef} type="file" accept=".xlsx,.xls" onChange={handleMSGFileChange} style={{ display: 'none' }} />
          </>
        )}
      </div>

      <div className="toolbar-right">
        {/* Печать МСГ — только на вкладке monthly */}
        {activeTab === 'monthly' && onPrint && (
          <button onClick={onPrint} className="toolbar-btn" title="Печать МСГ">
            🖨️ Печать МСГ
          </button>
        )}

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
