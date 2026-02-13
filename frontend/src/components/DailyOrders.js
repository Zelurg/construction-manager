import React, { useState, useEffect } from 'react';
import { dailyAPI, scheduleAPI, employeesAPI, executorsAPI } from '../services/api';
import websocketService from '../services/websocket';
import ColumnSettings from './ColumnSettings';
import '../styles/DailyOrders.css';

function DailyOrders({ onShowColumnSettings }) {
  const [works, setWorks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [showModal, setShowModal] = useState(false);
  const [showExecutorsModal, setShowExecutorsModal] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [formData, setFormData] = useState({
    task_id: '',
    volume: '',
    description: ''
  });
  
  // Состояние для исполнителей
  const [employees, setEmployees] = useState([]);
  const [executorsStats, setExecutorsStats] = useState(null);
  const [selectedEmployees, setSelectedEmployees] = useState({});
  const [responsibleId, setResponsibleId] = useState('');
  
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
    loadEmployees();
    loadExecutorsStats();
    
    websocketService.connect();
    
    const handleDailyWorkCreated = (message) => {
      loadDailyWorks();
      loadExecutorsStats();
    };
    
    const handleTaskUpdated = (message) => {
      loadDailyWorks();
      loadTasks();
    };
    
    const handleExecutorChanged = (message) => {
      loadExecutorsStats();
    };
    
    websocketService.on('daily_work_created', handleDailyWorkCreated);
    websocketService.on('task_updated', handleTaskUpdated);
    websocketService.on('executor_added', handleExecutorChanged);
    websocketService.on('executor_updated', handleExecutorChanged);
    websocketService.on('executor_deleted', handleExecutorChanged);
    
    return () => {
      websocketService.off('daily_work_created', handleDailyWorkCreated);
      websocketService.off('task_updated', handleTaskUpdated);
      websocketService.off('executor_added', handleExecutorChanged);
      websocketService.off('executor_updated', handleExecutorChanged);
      websocketService.off('executor_deleted', handleExecutorChanged);
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
      setAllTasks(response.data);
      const workTasks = response.data.filter(task => !task.is_section);
      setTasks(workTasks);
    } catch (error) {
      console.error('Ошибка загрузки задач:', error);
    }
  };

  const loadEmployees = async () => {
    try {
      const response = await employeesAPI.getAll({ active_only: true });
      setEmployees(response.data);
    } catch (error) {
      console.error('Ошибка загрузки сотрудников:', error);
    }
  };

  const loadExecutorsStats = async () => {
    try {
      const response = await executorsAPI.getStats(selectedDate);
      setExecutorsStats(response.data);
      
      // Заполняем selectedEmployees из загруженных данных
      const newSelected = {};
      response.data.executors.forEach(exec => {
        if (!exec.is_responsible) {
          newSelected[exec.employee_id] = {
            id: exec.id,
            hours: exec.hours_worked
          };
        }
      });
      setSelectedEmployees(newSelected);
      
      // Устанавливаем ответственного
      if (response.data.responsible) {
        const responsibleExec = response.data.executors.find(e => e.is_responsible);
        if (responsibleExec) {
          setResponsibleId(responsibleExec.employee_id.toString());
        }
      } else {
        setResponsibleId('');
      }
    } catch (error) {
      console.error('Ошибка загрузки статистики исполнителей:', error);
    }
  };

  const handleOpenExecutorsModal = () => {
    setShowExecutorsModal(true);
  };

  const handleEmployeeToggle = (employeeId) => {
    setSelectedEmployees(prev => {
      const newSelected = { ...prev };
      if (newSelected[employeeId]) {
        delete newSelected[employeeId];
      } else {
        newSelected[employeeId] = { id: null, hours: 10.0 };
      }
      return newSelected;
    });
  };

  const handleHoursChange = (employeeId, hours) => {
    setSelectedEmployees(prev => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], hours: parseFloat(hours) || 0 }
    }));
  };

  const handleSaveExecutors = async () => {
    try {
      // Сначала удаляем всех старых исполнителей
      if (executorsStats && executorsStats.executors) {
        for (const exec of executorsStats.executors) {
          await executorsAPI.delete(exec.id);
        }
      }
      
      // Добавляем ответственного
      if (responsibleId) {
        await executorsAPI.create({
          date: selectedDate,
          employee_id: parseInt(responsibleId),
          hours_worked: 10.0,
          is_responsible: true
        });
      }
      
      // Добавляем исполнителей
      for (const [employeeId, data] of Object.entries(selectedEmployees)) {
        await executorsAPI.create({
          date: selectedDate,
          employee_id: parseInt(employeeId),
          hours_worked: data.hours,
          is_responsible: false
        });
      }
      
      setShowExecutorsModal(false);
      await loadExecutorsStats();
    } catch (error) {
      console.error('Ошибка сохранения исполнителей:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка сохранения';
      alert(errorMessage);
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
  
  const getBreadcrumb = (work) => {
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

  // Расчет эффективности
  const getEfficiencyColor = () => {
    if (!executorsStats) return 'gray';
    const diff = executorsStats.total_hours_worked - executorsStats.total_labor_hours;
    if (Math.abs(diff) < 1) return 'green';
    if (diff > 0) return 'orange';
    return 'blue';
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
        
        {/* Информация об исполнителях */}
        {executorsStats && executorsStats.executors_count > 0 && (
          <div className="executors-info">
            <div className="executors-summary">
              <span>👥 {executorsStats.executors_count} чел.</span>
              <span>⏱️ {executorsStats.total_hours_worked.toFixed(1)} ч/ч</span>
              <span style={{ color: getEfficiencyColor() }}>
                📊 {executorsStats.total_labor_hours.toFixed(1)} ч/ч (норма)
              </span>
              {executorsStats.responsible && (
                <span>👨‍💼 {executorsStats.responsible.full_name}</span>
              )}
            </div>
          </div>
        )}
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleOpenExecutorsModal} className="btn-secondary">
            👥 Указать исполнителей
          </button>
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

      {/* Модальное окно для внесения объёма */}
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

      {/* Модальное окно для указания исполнителей */}
      {showExecutorsModal && (
        <div className="modal-overlay" onClick={() => setShowExecutorsModal(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <h3>Указать исполнителей за {new Date(selectedDate).toLocaleDateString('ru-RU')}</h3>

            <div className="executors-form">
              {/* Ответственный */}
              <div className="form-group">
                <label>Ответственный (прораб):</label>
                <select
                  value={responsibleId}
                  onChange={(e) => setResponsibleId(e.target.value)}
                >
                  <option value="">Не указан</option>
                  {employees
                    .filter(emp => !selectedEmployees[emp.id])
                    .map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} - {emp.position}
                      </option>
                    ))
                  }
                </select>
              </div>

              <hr />

              {/* Список исполнителей */}
              <div className="form-group">
                <label>Исполнители работ:</label>
                <div className="executors-list">
                  {employees.length === 0 ? (
                    <p>Сотрудников нет. Добавьте их в справочнике.</p>
                  ) : (
                    employees
                      .filter(emp => emp.id.toString() !== responsibleId)
                      .map(emp => (
                        <div key={emp.id} className="executor-item">
                          <label className="executor-checkbox">
                            <input
                              type="checkbox"
                              checked={!!selectedEmployees[emp.id]}
                              onChange={() => handleEmployeeToggle(emp.id)}
                            />
                            <span className="employee-info">
                              <strong>{emp.full_name}</strong>
                              <span className="employee-position">{emp.position}</span>
                            </span>
                          </label>
                          {selectedEmployees[emp.id] && (
                            <div className="hours-input">
                              <input
                                type="number"
                                min="0"
                                max="24"
                                step="0.5"
                                value={selectedEmployees[emp.id].hours}
                                onChange={(e) => handleHoursChange(emp.id, e.target.value)}
                              />
                              <span>часов</span>
                            </div>
                          )}
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Итоговая статистика */}
              {Object.keys(selectedEmployees).length > 0 && (
                <div className="executors-summary-box">
                  <strong>Итого:</strong>
                  <p>Исполнителей: {Object.keys(selectedEmployees).length}</p>
                  <p>Суммарно часов: {Object.values(selectedEmployees).reduce((sum, e) => sum + e.hours, 0).toFixed(1)}</p>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button onClick={() => setShowExecutorsModal(false)} className="btn-cancel">
                Отмена
              </button>
              <button onClick={handleSaveExecutors} className="btn-submit">
                Сохранить
              </button>
            </div>
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
