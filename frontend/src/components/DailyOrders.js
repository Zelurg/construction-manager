import React, { useState, useEffect } from 'react';
import { dailyAPI, scheduleAPI } from '../services/api';
import websocketService from '../services/websocket';
import ColumnSettings from './ColumnSettings';

function DailyOrders({ onShowColumnSettings }) {
  const [works, setWorks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]); // Для breadcrumbs нужны все задачи включая разделы
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [showModal, setShowModal] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [formData, setFormData] = useState({
    task_id: '',
    volume: '',
    description: ''
  });
  
  const availableColumns = [
    { key: 'code', label: 'Шифр', isBase: true },
    { key: 'name', label: 'Наименование', isBase: true },
    { key: 'unit', label: 'Ед. изм.', isBase: true },
    { key: 'volume', label: 'Объем', isBase: true },
    { key: 'description', label: 'Описание', isBase: true },
    { key: 'executor', label: 'Исполнитель', isBase: false },
    { key: 'unit_price', label: 'Цена за ед.', isBase: false },
    { key: 'labor_per_unit', label: 'Трудозатраты на ед.', isBase: false },
    { key: 'machine_hours_per_unit', label: 'Машиночасы на ед.', isBase: false },
    { key: 'labor_total', label: 'Трудозатраты', isBase: false, isCalculated: true },
    { key: 'cost_total', label: 'Стоимость', isBase: false, isCalculated: true },
    { key: 'machine_hours_total', label: 'Машиночасы', isBase: false, isCalculated: true },
  ];
  
  const defaultColumns = ['code', 'name', 'unit', 'volume', 'description'];
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('dailyOrdersVisibleColumns');
    return saved ? JSON.parse(saved) : defaultColumns;
  });

  useEffect(() => {
    if (onShowColumnSettings) {
      onShowColumnSettings(() => setShowColumnSettings(true));
    }
  }, [onShowColumnSettings]);

  useEffect(() => {
    loadDailyWorks();
    loadTasks();
    
    websocketService.connect();
    
    const handleDailyWorkCreated = (message) => {
      console.log('Daily work created:', message.data);
      loadDailyWorks();
    };
    
    const handleTaskUpdated = (message) => {
      console.log('Task updated, refreshing daily view:', message.data);
      loadDailyWorks();
      loadTasks();
    };
    
    websocketService.on('daily_work_created', handleDailyWorkCreated);
    websocketService.on('task_updated', handleTaskUpdated);
    
    return () => {
      websocketService.off('daily_work_created', handleDailyWorkCreated);
      websocketService.off('task_updated', handleTaskUpdated);
    };
  }, [selectedDate]);

  const loadDailyWorks = async () => {
    try {
      const response = await dailyAPI.getWorks(selectedDate);
      setWorks(response.data);
    } catch (error) {
      console.error('Ошибка загрузки ежедневных работ:', error);
    }
  };

  const loadTasks = async () => {
    try {
      const response = await scheduleAPI.getTasks();
      // Сохраняем все задачи для breadcrumbs
      setAllTasks(response.data);
      // Фильтруем только работы для выбора в модалке
      const workTasks = response.data.filter(task => !task.is_section);
      setTasks(workTasks);
    } catch (error) {
      console.error('Ошибка загрузки задач:', error);
    }
  };

  const handleAddWork = () => {
    setFormData({
      task_id: '',
      volume: '',
      description: ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const workData = {
        task_id: parseInt(formData.task_id),
        date: selectedDate,
        volume: parseFloat(formData.volume),
        description: formData.description || null
      };
      
      await dailyAPI.createWork(workData);
      setShowModal(false);
      
      await loadDailyWorks();
      await loadTasks();
    } catch (error) {
      alert('Ошибка при добавлении работы');
      console.error(error);
    }
  };

  const getTaskInfo = (taskId) => {
    return tasks.find(t => t.id === taskId);
  };
  
  // Получение полного пути раздела (хлебные крошки)
  const getBreadcrumb = (work) => {
    // Находим задачу по code
    const task = allTasks.find(t => t.code === work.code);
    if (!task || !task.parent_code) return '';
    
    const breadcrumbs = [];
    let currentCode = task.parent_code;
    
    while (currentCode) {
      const parentTask = allTasks.find(t => t.code === currentCode);
      if (parentTask) {
        breadcrumbs.unshift(parentTask.name);
        currentCode = parentTask.parent_code;
      } else {
        break;
      }
    }
    
    return breadcrumbs.length > 0 ? breadcrumbs.join(' / ') + ' / ' : '';
  };
  
  const getCellValue = (work, columnKey) => {
    const task = allTasks.find(t => t.code === work.code);
    
    switch(columnKey) {
      case 'name':
        // Добавляем хлебные крошки
        const breadcrumb = getBreadcrumb(work);
        return breadcrumb ? (
          <span>
            <span style={{ color: '#999', fontSize: '0.85em' }}>{breadcrumb}</span>
            {work.name}
          </span>
        ) : work.name;
      case 'labor_total':
        if (!task) return '-';
        return (work.volume * (task.labor_per_unit || 0)).toFixed(2);
      case 'cost_total':
        if (!task) return '-';
        return (work.volume * (task.unit_price || 0)).toFixed(2);
      case 'machine_hours_total':
        if (!task) return '-';
        return (work.volume * (task.machine_hours_per_unit || 0)).toFixed(2);
      case 'executor':
      case 'unit_price':
      case 'labor_per_unit':
      case 'machine_hours_per_unit':
        if (!task) return '-';
        return task[columnKey] !== undefined && task[columnKey] !== null ? task[columnKey] : '-';
      case 'description':
        return work[columnKey] || '-';
      default:
        return work[columnKey] || '-';
    }
  };
  
  const getColumnLabel = (columnKey) => {
    const column = availableColumns.find(col => col.key === columnKey);
    return column ? column.label : columnKey;
  };
  
  const handleSaveColumnSettings = (newVisibleColumns) => {
    setVisibleColumns(newVisibleColumns);
    localStorage.setItem('dailyOrdersVisibleColumns', JSON.stringify(newVisibleColumns));
  };

  return (
    <div className="daily-orders">
      <div className="controls-header">
        <div className="date-selector">
          <label>Выберите дату:</label>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleAddWork} className="btn-primary">
            + Внести объём
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="tasks-table">
          <thead>
            <tr>
              {visibleColumns.map(columnKey => (
                <th key={columnKey}>{getColumnLabel(columnKey)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {works.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} style={{ textAlign: 'center', padding: '20px' }}>
                  Нет данных за выбранную дату
                </td>
              </tr>
            ) : (
              works.map(work => (
                <tr key={work.id}>
                  {visibleColumns.map(columnKey => (
                    <td key={columnKey}>{getCellValue(work, columnKey)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Внести объём работ за {new Date(selectedDate).toLocaleDateString('ru-RU')}</h3>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Выберите работу *</label>
                <select
                  value={formData.task_id}
                  onChange={(e) => setFormData({...formData, task_id: e.target.value})}
                  required
                >
                  <option value="">Выберите...</option>
                  {tasks.map(task => (
                    <option key={task.id} value={task.id}>
                      {task.code} - {task.name} ({task.unit})
                    </option>
                  ))}
                </select>
              </div>

              {formData.task_id && (
                <div className="task-info" style={{ 
                  background: '#f5f5f5', 
                  padding: '10px', 
                  borderRadius: '4px', 
                  marginBottom: '15px',
                  fontSize: '14px'
                }}>
                  <strong>Информация о задаче:</strong><br/>
                  План: {getTaskInfo(parseInt(formData.task_id))?.volume_plan} {getTaskInfo(parseInt(formData.task_id))?.unit}<br/>
                  Факт: {getTaskInfo(parseInt(formData.task_id))?.volume_fact} {getTaskInfo(parseInt(formData.task_id))?.unit}<br/>
                  Осталось: {(getTaskInfo(parseInt(formData.task_id))?.volume_plan - getTaskInfo(parseInt(formData.task_id))?.volume_fact).toFixed(2)} {getTaskInfo(parseInt(formData.task_id))?.unit}
                </div>
              )}

              <div className="form-group">
                <label>Объем выполненных работ *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.volume}
                  onChange={(e) => setFormData({...formData, volume: e.target.value})}
                  placeholder="Введите объём"
                  required
                />
              </div>

              <div className="form-group">
                <label>Описание (необязательно)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Комментарий к выполненным работам"
                  rows="3"
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowModal(false)} className="btn-cancel">
                  Отмена
                </button>
                <button type="submit" className="btn-submit">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {showColumnSettings && (
        <ColumnSettings
          availableColumns={availableColumns}
          visibleColumns={visibleColumns}
          onSave={handleSaveColumnSettings}
          onClose={() => setShowColumnSettings(false)}
        />
      )}
    </div>
  );
}

export default DailyOrders;
