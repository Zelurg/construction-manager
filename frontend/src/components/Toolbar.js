import React, { useRef } from 'react';
import authService from '../services/authService';
import api from '../services/api';
import '../styles/Toolbar.css';

function Toolbar({ onDownloadTemplate, onUploadTemplate, showGantt, onToggleGantt }) {
  const fileInputRef = useRef(null);
  const user = authService.getCurrentUser();
  const isAdmin = user?.role === 'admin';

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && onUploadTemplate) {
      onUploadTemplate(file);
      event.target.value = '';
    }
  };

  const handleRecalculateVolumes = async () => {
    if (!window.confirm('Пересчитать фактические объёмы для всех задач?\n\nЭто обновит volume_fact на основе всех ежедневных нарядов.')) {
      return;
    }

    try {
      const response = await api.post('/admin/recalculate-volumes');
      const data = response.data;
      
      alert(
        `✅ Пересчёт завершён!\n\n` +
        `Всего задач: ${data.total_tasks}\n` +
        `Обновлено: ${data.updated_tasks}\n\n` +
        `Страница будет перезагружена для обновления данных.`
      );
      
      // Перезагружаем страницу чтобы обновить все вкладки
      window.location.reload();
    } catch (error) {
      console.error('Ошибка пересчёта объёмов:', error);
      alert('❌ Ошибка при пересчёте объёмов: ' + (error.response?.data?.detail || error.message));
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar-content">
        <button
          className="toolbar-button"
          onClick={onDownloadTemplate}
          title="Скачать шаблон для импорта"
        >
          <span className="toolbar-icon">📥</span>
        </button>

        <button
          className="toolbar-button"
          onClick={handleFileClick}
          title="Загрузить шаблон"
        >
          <span className="toolbar-icon">📤</span>
        </button>

        {/* Кнопка переключения диаграммы */}
        {onToggleGantt && (
          <button
            className={`toolbar-button ${showGantt ? '' : 'inactive'}`}
            onClick={onToggleGantt}
            title={showGantt ? "Скрыть диаграмму Ганта" : "Показать диаграмму Ганта"}
          >
            <span className="toolbar-icon">{showGantt ? '📊' : '📈'}</span>
          </button>
        )}

        {/* Кнопка пересчёта объёмов (только для админа) */}
        {isAdmin && (
          <button
            className="toolbar-button admin-button"
            onClick={handleRecalculateVolumes}
            title="Пересчитать фактические объёмы на основе ежедневных нарядов"
          >
            <span className="toolbar-icon">🔄</span>
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
}

export default Toolbar;
