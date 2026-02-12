import React, { useState, useEffect, useRef } from 'react';
import { scheduleAPI } from '../services/api';
import websocketService from '../services/websocket';
import GanttChart from './GanttChart';
import ColumnSettings from './ColumnSettings';

function Schedule({ showGantt, onShowColumnSettings }) {
  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [filters, setFilters] = useState({
    code: '',
    name: '',
    unit: ''
  });
  const [tableWidth, setTableWidth] = useState(60);
  const [isResizing, setIsResizing] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  
  // Доступные колонки (все возможные атрибуты)
  const availableColumns = [
    // Базовые атрибуты
    { key: 'code', label: 'Шифр', isBase: true },
    { key: 'name', label: 'Наименование', isBase: true },
    { key: 'unit', label: 'Ед. изм.', isBase: true },
    { key: 'volume_plan', label: 'Объем план', isBase: true },
    { key: 'volume_fact', label: 'Объем факт', isBase: true },
    { key: 'volume_remaining', label: 'Объем остаток', isBase: false, isCalculated: true },
    { key: 'start_date', label: 'Дата старта', isBase: true },
    { key: 'end_date', label: 'Дата финиша', isBase: true },
    // Новые атрибуты из шаблона
    { key: 'unit_price', label: 'Цена за ед.', isBase: false },
    { key: 'labor_per_unit', label: 'Трудозатраты на ед.', isBase: false },
    { key: 'machine_hours_per_unit', label: 'Машиночасы на ед.', isBase: false },
    { key: 'executor', label: 'Исполнитель', isBase: false },
    // Вычисляемые атрибуты
    { key: 'labor_total', label: 'Всего трудозатрат', isBase: false, isCalculated: true },
    { key: 'labor_fact', label: 'Трудозатраты факт', isBase: false, isCalculated: true },
    { key: 'labor_remaining', label: 'Остаток трудозатрат', isBase: false, isCalculated: true },
    { key: 'cost_total', label: 'Стоимость всего', isBase: false, isCalculated: true },
    { key: 'cost_fact', label: 'Стоимость факт', isBase: false, isCalculated: true },
    { key: 'cost_remaining', label: 'Остаток стоимости', isBase: false, isCalculated: true },
    { key: 'machine_hours_total', label: 'Всего машиночасов', isBase: false, isCalculated: true },
    { key: 'machine_hours_fact', label: 'Машиночасы факт', isBase: false, isCalculated: true },
  ];
  
  // Видимые колонки по умолчанию
  const defaultColumns = ['code', 'name', 'unit', 'volume_plan', 'volume_fact', 'volume_remaining', 'start_date', 'end_date'];
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('scheduleVisibleColumns');
    return saved ? JSON.parse(saved) : defaultColumns;
  });
  
  const containerRef = useRef(null);
  const tableScrollRef = useRef(null);
  const ganttScrollRef = useRef(null);

  // Пробрасываем функцию открытия настроек наверх
  useEffect(() => {
    if (onShowColumnSettings) {
      onShowColumnSettings(() => setShowColumnSettings(true));
    }
  }, [onShowColumnSettings]);

  useEffect(() => {
    loadTasks();
    
    // Подключаемся к WebSocket
    websocketService.connect();
    
    // Обработчики WebSocket событий
    const handleTaskCreated = (message) => {
      console.log('New task created:', message.data);
      setTasks(prevTasks => [...prevTasks, message.data]);
    };
    
    const handleTaskUpdated = (message) => {
      console.log('Task updated:', message.data);
      setTasks(prevTasks => 
        prevTasks.map(task => 
          task.id === message.data.id ? message.data : task
        )
      );
    };
    
    const handleTaskDeleted = (message) => {
      console.log('Task deleted:', message.data.id);
      setTasks(prevTasks => 
        prevTasks.filter(task => task.id !== message.data.id)
      );
    };
    
    // Регистрируем обработчики
    websocketService.on('task_created', handleTaskCreated);
    websocketService.on('task_updated', handleTaskUpdated);
    websocketService.on('task_deleted', handleTaskDeleted);
    
    // Очистка при размонтировании
    return () => {
      websocketService.off('task_created', handleTaskCreated);
      websocketService.off('task_updated', handleTaskUpdated);
      websocketService.off('task_deleted', handleTaskDeleted);
    };
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
  
  // Функция для вычисления значения ячейки
  const getCellValue = (task, columnKey) => {
    switch(columnKey) {
      case 'volume_remaining':
        return (task.volume_plan - task.volume_fact).toFixed(2);
      
      // Трудозатраты
      case 'labor_total':
        return ((task.labor_per_unit || 0) * task.volume_plan).toFixed(2);
      case 'labor_fact':
        return ((task.labor_per_unit || 0) * task.volume_fact).toFixed(2);
      case 'labor_remaining':
        const volRemaining = task.volume_plan - task.volume_fact;
        return ((task.labor_per_unit || 0) * volRemaining).toFixed(2);
      
      // Стоимость
      case 'cost_total':
        return ((task.unit_price || 0) * task.volume_plan).toFixed(2);
      case 'cost_fact':
        return ((task.unit_price || 0) * task.volume_fact).toFixed(2);
      case 'cost_remaining':
        const costVolRemaining = task.volume_plan - task.volume_fact;
        return ((task.unit_price || 0) * costVolRemaining).toFixed(2);
      
      // Машиночасы
      case 'machine_hours_total':
        return ((task.machine_hours_per_unit || 0) * task.volume_plan).toFixed(2);
      case 'machine_hours_fact':
        return ((task.machine_hours_per_unit || 0) * task.volume_fact).toFixed(2);
      
      case 'start_date':
      case 'end_date':
        return new Date(task[columnKey]).toLocaleDateString('ru-RU');
      case 'code':
      case 'name':
      case 'unit':
      case 'executor':
        return task[columnKey] || '-';
      default:
        return task[columnKey] !== undefined ? task[columnKey] : '-';
    }
  };
  
  // Функция для получения заголовка колонки
  const getColumnLabel = (columnKey) => {
    const column = availableColumns.find(col => col.key === columnKey);
    return column ? column.label : columnKey;
  };
  
  // Обработчик сохранения настроек колонок
  const handleSaveColumnSettings = (newVisibleColumns) => {
    setVisibleColumns(newVisibleColumns);
    localStorage.setItem('scheduleVisibleColumns', JSON.stringify(newVisibleColumns));
  };

  const handleMouseDown = (e) => {
    setIsResizing(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing || !containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      
      if (newWidth >= 30 && newWidth <= 80) {
        setTableWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div 
      className="schedule-container-integrated" 
      ref={containerRef}
      style={{ userSelect: isResizing ? 'none' : 'auto' }}
    >
      <div className="schedule-split-view">
        {/* Левая часть - таблица с данными */}
        <div 
          className="schedule-table-section" 
          style={{ width: showGantt ? `${tableWidth}%` : '100%' }}
          ref={tableScrollRef}
        >
          <div className="table-wrapper">
            <table className="tasks-table-integrated">
              <thead>
                <tr>
                  {visibleColumns.map(columnKey => (
                    <th key={columnKey}>
                      <div>{getColumnLabel(columnKey)}</div>
                      {['code', 'name', 'unit'].includes(columnKey) && (
                        <input 
                          type="text" 
                          placeholder="Фильтр..."
                          value={filters[columnKey] || ''}
                          onChange={(e) => handleFilterChange(columnKey, e.target.value)}
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map(task => (
                  <tr key={task.id}>
                    {visibleColumns.map(columnKey => (
                      <td key={columnKey}>{getCellValue(task, columnKey)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Разделитель */}
        {showGantt && (
          <div 
            className="resize-divider"
            onMouseDown={handleMouseDown}
          >
            <div className="resize-handle"></div>
          </div>
        )}

        {/* Правая часть - диаграмма Ганта */}
        {showGantt && (
          <div 
            className="schedule-gantt-section"
            style={{ width: `${100 - tableWidth}%` }}
            ref={ganttScrollRef}
          >
            <GanttChart tasks={filteredTasks} />
          </div>
        )}
      </div>
      
      {/* Модальное окно настройки колонок */}
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

export default Schedule;
