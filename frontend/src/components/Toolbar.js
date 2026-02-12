import React, { useRef } from 'react';
import '../styles/Toolbar.css';

function Toolbar({ onDownloadTemplate, onUploadTemplate, showGantt, onToggleGantt }) {
  const fileInputRef = useRef(null);

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
