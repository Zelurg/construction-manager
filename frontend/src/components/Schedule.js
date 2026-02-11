import React, { useState, useEffect, useRef } from 'react';
import { scheduleAPI, importExportAPI } from '../services/api';
import GanttChart from './GanttChart';

function Schedule() {
  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [showGantt, setShowGantt] = useState(true);
  const [filters, setFilters] = useState({
    code: '',
    name: '',
    unit: ''
  });
  const [uploadStatus, setUploadStatus] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [tasks, filters]);

  const loadTasks = async () => {
    try {
      const response = await scheduleAPI.getTasks();
      setTasks(response.data);
    } catch (error) {
      console.error('Ошибка загрузки задач:', error);
    }
  };

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
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Ошибка скачивания шаблона:', error);
      alert('Ошибка скачивания шаблона');
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      handleUploadTemplate(file);
    }
  };

  const handleUploadTemplate = async (file) => {
    try {
      setUploadStatus('loading');
      const response = await importExportAPI.uploadTemplate(file);
      setUploadStatus('success');
      alert(`Успешно обработано задач: ${response.data.tasks_processed}\n` +
            (response.data.errors.length > 0 ? `Ошибки:\n${response.data.errors.join('\n')}` : ''));
      loadTasks();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      setUploadStatus('error');
      console.error('Ошибка загрузки файла:', error);
      alert('Ошибка загрузки файла: ' + (error.response?.data?.detail || error.message));
    }
  };

  const applyFilters = () => {
    let filtered = tasks;
    
    if (filters.code) {
      filtered = filtered.filter(t => 
        t.code.toLowerCase().includes(filters.code.toLowerCase())
      );
    }
    if (filters.name) {
      filtered = filtered.filter(t => 
        t.name.toLowerCase().includes(filters.name.toLowerCase())
      );
    }
    if (filters.unit) {
      filtered = filtered.filter(t => 
        t.unit.toLowerCase().includes(filters.unit.toLowerCase())
      );
    }
    
    setFilteredTasks(filtered);
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="schedule-container">
      {<div className="import-export-panel">
        <button onClick={handleDownloadTemplate} className="btn-download-template">
          📥 Скачать шаблон для импорта
        </button>
        <label className="btn-upload-template">
          📤 Загрузить шаблон
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </label>
        {uploadStatus === 'loading' && <span>Загрузка...</span>}
      </div>}
      {showGantt && (
        <div className="gantt-panel">
          <GanttChart tasks={filteredTasks} />
          <button onClick={() => setShowGantt(false)} className="hide-gantt">
            Скрыть диаграмму
          </button>
        </div>
      )}
      
      {!showGantt && (
        <button onClick={() => setShowGantt(true)} className="show-gantt">
          Показать диаграмму Ганта
        </button>
      )}

      <div className="table-container">
        <table className="tasks-table">
          <thead>
            <tr>
              <th>
                <div>Шифр</div>
                <input 
                  type="text" 
                  placeholder="Фильтр..."
                  value={filters.code}
                  onChange={(e) => handleFilterChange('code', e.target.value)}
                />
              </th>
              <th>
                <div>Наименование</div>
                <input 
                  type="text" 
                  placeholder="Фильтр..."
                  value={filters.name}
                  onChange={(e) => handleFilterChange('name', e.target.value)}
                />
              </th>
              <th>
                <div>Ед. изм.</div>
                <input 
                  type="text" 
                  placeholder="Фильтр..."
                  value={filters.unit}
                  onChange={(e) => handleFilterChange('unit', e.target.value)}
                />
              </th>
              <th>Объем план</th>
              <th>Объем факт</th>
              <th>Объем остаток</th>
              <th>Дата старта</th>
              <th>Дата финиша</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map(task => (
              <tr key={task.id}>
                <td>{task.code}</td>
                <td>{task.name}</td>
                <td>{task.unit}</td>
                <td>{task.volume_plan}</td>
                <td>{task.volume_fact}</td>
                <td>{task.volume_plan - task.volume_fact}</td>
                <td>{new Date(task.start_date).toLocaleDateString()}</td>
                <td>{new Date(task.end_date).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Schedule;
