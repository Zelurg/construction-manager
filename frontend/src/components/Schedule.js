import React, { useState, useEffect, useRef } from 'react';
import { scheduleAPI } from '../services/api';
import websocketService from '../services/websocket';
import GanttChart from './GanttChart';
import ColumnSettings from './ColumnSettings';

// Пастельные цвета для разных уровней разделов
const SECTION_COLORS = [
  '#E8F4F8',  // level 0 - светло-голубой
  '#F0F8E8',  // level 1 - светло-зеленый
  '#FFF4E6',  // level 2 - светло-оранжевый
  '#F8E8F4',  // level 3 - светло-розовый
  '#E8F0F8',  // level 4 - светло-синий
];

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
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [userRole, setUserRole] = useState(null);
  
  const availableColumns = [
    { key: 'code', label: 'Шифр', isBase: true },
    { key: 'name', label: 'Наименование', isBase: true },
    { key: 'unit', label: 'Ед. изм.', isBase: true },
    { key: 'volume_plan', label: 'Объем план', isBase: true },
    { key: 'volume_fact', label: 'Объем факт', isBase: true },
    { key: 'volume_remaining', label: 'Объем остаток', isBase: false, isCalculated: true },
    { key: 'start_date', label: 'Дата старта', isBase: true },
    { key: 'end_date', label: 'Дата финиша', isBase: true },
    { key: 'unit_price', label: 'Цена за ед.', isBase: false },
    { key: 'labor_per_unit', label: 'Трудозатраты на ед.', isBase: false },
    { key: 'machine_hours_per_unit', label: 'Машиночасы на ед.', isBase: false },
    { key: 'executor', label: 'Исполнитель', isBase: false },
    { key: 'labor_total', label: 'Всего трудозатрат', isBase: false, isCalculated: true },
    { key: 'labor_fact', label: 'Трудозатраты факт', isBase: false, isCalculated: true },
    { key: 'labor_remaining', label: 'Остаток трудозатрат', isBase: false, isCalculated: true },
    { key: 'cost_total', label: 'Стоимость всего', isBase: false, isCalculated: true },
    { key: 'cost_fact', label: 'Стоимость факт', isBase: false, isCalculated: true },
    { key: 'cost_remaining', label: 'Остаток стоимости', isBase: false, isCalculated: true },
    { key: 'machine_hours_total', label: 'Всего машиночасов', isBase: false, isCalculated: true },
    { key: 'machine_hours_fact', label: 'Машиночасы факт', isBase: false, isCalculated: true },
  ];
  
  const defaultColumns = ['code', 'name', 'unit', 'volume_plan', 'volume_fact', 'volume_remaining', 'start_date', 'end_date'];
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('scheduleVisibleColumns');
    return saved ? JSON.parse(saved) : defaultColumns;
  });
  
  const containerRef = useRef(null);
  const tableScrollRef = useRef(null);
  const ganttScrollRef = useRef(null);

  useEffect(() => {
    // Получаем роль пользователя из localStorage
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setUserRole(user.role);
  }, []);

  useEffect(() => {
    if (onShowColumnSettings) {
      onShowColumnSettings(() => setShowColumnSettings(true));
    }
  }, [onShowColumnSettings]);

  useEffect(() => {
    loadTasks();
    
    websocketService.connect();
    
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
    
    websocketService.on('task_created', handleTaskCreated);
    websocketService.on('task_updated', handleTaskUpdated);
    websocketService.on('task_deleted', handleTaskDeleted);
    
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
  
  const handleClearSchedule = async () => {
    try {
      await scheduleAPI.clearAll();
      setTasks([]);
      setShowClearConfirm(false);
      alert('График успешно очищен');
    } catch (error) {
      console.error('Ошибка очистки графика:', error);
      alert('Ошибка при очистке графика');
    }
  };
  
  // Получение полного пути раздела (хлебные крошки)
  const getBreadcrumb = (task) => {
    if (!task.parent_code) return '';
    
    const breadcrumbs = [];
    let currentCode = task.parent_code;
    
    while (currentCode) {
      const parentTask = tasks.find(t => t.code === currentCode);
      if (parentTask) {
        breadcrumbs.unshift(parentTask.name);
        currentCode = parentTask.parent_code;
      } else {
        break;
      }
    }
    
    return breadcrumbs.length > 0 ? breadcrumbs.join(' / ') + ' / ' : '';
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
        t.unit && t.unit.toLowerCase().includes(filters.unit.toLowerCase())
      );
    }
    
    setFilteredTasks(filtered);
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };
  
  const getCellValue = (task, columnKey) => {
    switch(columnKey) {
      case 'volume_remaining':
        return task.is_section ? '-' : (task.volume_plan - task.volume_fact).toFixed(2);
      case 'labor_total':
        return task.is_section ? '-' : ((task.labor_per_unit || 0) * task.volume_plan).toFixed(2);
      case 'labor_fact':
        return task.is_section ? '-' : ((task.labor_per_unit || 0) * task.volume_fact).toFixed(2);
      case 'labor_remaining':
        if (task.is_section) return '-';
        const volRemaining = task.volume_plan - task.volume_fact;
        return ((task.labor_per_unit || 0) * volRemaining).toFixed(2);
      case 'cost_total':
        return task.is_section ? '-' : ((task.unit_price || 0) * task.volume_plan).toFixed(2);
      case 'cost_fact':
        return task.is_section ? '-' : ((task.unit_price || 0) * task.volume_fact).toFixed(2);
      case 'cost_remaining':
        if (task.is_section) return '-';
        const costVolRemaining = task.volume_plan - task.volume_fact;
        return ((task.unit_price || 0) * costVolRemaining).toFixed(2);
      case 'machine_hours_total':
        return task.is_section ? '-' : ((task.machine_hours_per_unit || 0) * task.volume_plan).toFixed(2);
      case 'machine_hours_fact':
        return task.is_section ? '-' : ((task.machine_hours_per_unit || 0) * task.volume_fact).toFixed(2);
      case 'start_date':
      case 'end_date':
        return task[columnKey] ? new Date(task[columnKey]).toLocaleDateString('ru-RU') : '-';
      case 'name':
        // Добавляем хлебные крошки для отфильтрованных задач
        const breadcrumb = (filters.code || filters.name) ? getBreadcrumb(task) : '';
        return breadcrumb ? (
          <span>
            <span style={{ color: '#999', fontSize: '0.85em' }}>{breadcrumb}</span>
            {task.name}
          </span>
        ) : task.name;
      case 'code':
      case 'unit':
      case 'executor':
        return task[columnKey] || '-';
      default:
        return task[columnKey] !== undefined && task[columnKey] !== null ? task[columnKey] : '-';
    }
  };
  
  const getColumnLabel = (columnKey) => {
    const column = availableColumns.find(col => col.key === columnKey);
    return column ? column.label : columnKey;
  };
  
  const handleSaveColumnSettings = (newVisibleColumns) => {
    setVisibleColumns(newVisibleColumns);
    localStorage.setItem('scheduleVisibleColumns', JSON.stringify(newVisibleColumns));
  };
  
  // Получение цвета фона для раздела
  const getRowStyle = (task) => {
    if (!task.is_section) return {};
    
    const color = SECTION_COLORS[task.level] || SECTION_COLORS[SECTION_COLORS.length - 1];
    return {
      backgroundColor: color,
      fontWeight: 'bold',
      fontSize: task.level === 0 ? '1.05em' : '1em'
    };
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
      {userRole === 'admin' && (
        <div style={{ padding: '10px', borderBottom: '1px solid #ddd' }}>
          <button 
            onClick={() => setShowClearConfirm(true)}
            style={{
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            🗑️ Очистить график
          </button>
        </div>
      )}
      
      <div className="schedule-split-view">
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
                  <tr key={task.id} style={getRowStyle(task)}>
                    {visibleColumns.map(columnKey => (
                      <td key={columnKey}>{getCellValue(task, columnKey)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showGantt && (
          <div 
            className="resize-divider"
            onMouseDown={handleMouseDown}
          >
            <div className="resize-handle"></div>
          </div>
        )}

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
      
      {showColumnSettings && (
        <ColumnSettings
          availableColumns={availableColumns}
          visibleColumns={visibleColumns}
          onSave={handleSaveColumnSettings}
          onClose={() => setShowColumnSettings(false)}
        />
      )}
      
      {showClearConfirm && (
        <div className="modal-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ Подтверждение очистки</h3>
            <p style={{ marginBottom: '20px' }}>
              Вы уверены, что хотите <strong>удалить ВСЕ данные</strong> графика?<br/>
              Это действие нельзя отменить!
            </p>
            <div className="modal-actions">
              <button 
                onClick={() => setShowClearConfirm(false)}
                className="btn-cancel"
              >
                Отмена
              </button>
              <button 
                onClick={handleClearSchedule}
                style={{
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Удалить всё
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Schedule;
