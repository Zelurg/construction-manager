import React, { useRef } from 'react';
import { importExportAPI, scheduleAPI } from '../services/api';
import './Toolbar.css';

function Toolbar({ 
  activeTab, 
  showGantt, 
  onToggleGantt, 
  onShowColumnSettings,
  onScheduleCleared,
  onShowFilters
}) {
  const fileInputRef = useRef(null);

  const handleDownloadTemplate = async () => {
    try {
      const response = await importExportAPI.downloadTemplate();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'template_schedule.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      alert('Ошибка при скачивании шаблона');
      console.error(error);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const response = await importExportAPI.uploadTemplate(file);
      alert(`Успешно загружено ${response.data.tasks_processed} задач`);
      
      if (response.data.errors && response.data.errors.length > 0) {
        console.warn('Ошибки при загрузке:', response.data.errors);
      }
      
      window.location.reload();
    } catch (error) {
      alert('Ошибка при загрузке файла');
      console.error(error);
    }

    event.target.value = '';
  };

  const handleClearSchedule = async () => {
    if (!window.confirm('Вы уверены, что хотите очистить весь график? Это действие нельзя отменить!')) {
      return;
    }

    try {
      await scheduleAPI.clearAll();
      alert('График успешно очищен');
      if (onScheduleCleared) {
        onScheduleCleared();
      }
    } catch (error) {
      alert('Ошибка при очистке графика');
      console.error('Ошибка очистки графика:', error);
    }
  };

  const handleColumnSettings = () => {
    if (onShowColumnSettings) {
      onShowColumnSettings();
    }
  };

  const handleFilters = () => {
    if (onShowFilters) {
      onShowFilters();
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        {activeTab === 'schedule' && (
          <>
            <button 
              onClick={handleDownloadTemplate}
              className="toolbar-btn"
              title="Скачать шаблон"
            >
              📥 Скачать шаблон
            </button>
            <button 
              onClick={handleUploadClick}
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
          <button 
            onClick={handleFilters}
            className="toolbar-btn"
            title="Управление фильтрами"
          >
            🔍 Фильтры
          </button>
        )}
        {(activeTab === 'schedule' || activeTab === 'monthly' || activeTab === 'daily') && (
          <button 
            onClick={handleColumnSettings}
            className="toolbar-btn"
            title="Настройка колонок"
          >
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
