import React, { useState, useEffect, useRef, useMemo } from 'react';
import { scheduleAPI } from '../services/api';
import websocketService from '../services/websocket';
import GanttChart from './GanttChart';
import ColumnSettings from './ColumnSettings';
import ColumnFilter from './ColumnFilter';
import FilterManager from './FilterManager';
import { useAuth } from '../contexts/AuthContext';

const SECTION_COLORS = [
  '#E8F4F8',
  '#F0F8E8',
  '#FFF4E6',
  '#F8E8F4',
  '#E8F0F8',
];

function Schedule({ showGantt, onShowColumnSettings, onShowFilters }) {
  const { user } = useAuth();
  
  const isAdmin = useMemo(() => {
    return user?.role === 'admin';
  }, [user]);
  
  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [filters, setFilters] = useState({});
  const [tableWidth, setTableWidth] = useState(60);
  const [isResizing, setIsResizing] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showFilterManager, setShowFilterManager] = useState(false);
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  
  const availableColumns = [
    { key: 'code', label: 'Шифр', isBase: true },
    { key: 'name', label: 'Наименование', isBase: true },
    { key: 'unit', label: 'Ед. изм.', isBase: true },
    { key: 'volume_plan', label: 'Объем план', isBase: true },
    { key: 'volume_fact', label: 'Объем факт', isBase: true },
    { key: 'volume_remaining', label: 'Объем остаток', isBase: false, isCalculated: true },
    { key: 'start_date_contract', label: 'Дата старта контракт', isBase: true },
    { key: 'end_date_contract', label: 'Дата финиша контракт', isBase: true },
    { key: 'start_date_plan', label: 'Дата старта план', isBase: true, editable: true },
    { key: 'end_date_plan', label: 'Дата финиша план', isBase: true, editable: true },
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
  
  const defaultColumns = ['code', 'name', 'unit', 'volume_plan', 'volume_fact', 'volume_remaining', 'start_date_contract', 'end_date_contract', 'start_date_plan', 'end_date_plan'];
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('scheduleVisibleColumns');
    return saved ? JSON.parse(saved) : defaultColumns;
  });
  
  const containerRef = useRef(null);
  const tableScrollRef = useRef(null);
  const ganttScrollRef = useRef(null);

  useEffect(() => {
    if (onShowColumnSettings) {
      onShowColumnSettings(() => setShowColumnSettings(true));
    }
  }, [onShowColumnSettings]);

  useEffect(() => {
    if (onShowFilters) {
      onShowFilters(() => setShowFilterManager(true));
    }
  }, [onShowFilters]);

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
          task.id === message.data.id ? { ...task, ...message.data } : task
        )
      );
    };
    
    const handleTaskDeleted = (message) => {
      console.log('Task deleted:', message.data.id);
      setTasks(prevTasks => 
        prevTasks.filter(task => task.id !== message.data.id)
      );
    };
    
    const handleScheduleCleared = (message) => {
      console.log('Schedule cleared:', message.data);
      setTasks([]);
      setFilteredTasks([]);
      setTimeout(() => {
        loadTasks();
      }, 100);
    };
    
    websocketService.on('task_created', handleTaskCreated);
    websocketService.on('task_updated', handleTaskUpdated);
    websocketService.on('task_deleted', handleTaskDeleted);
    websocketService.on('schedule_cleared', handleScheduleCleared);
    
    return () => {
      websocketService.off('task_created', handleTaskCreated);
      websocketService.off('task_updated', handleTaskUpdated);
      websocketService.off('task_deleted', handleTaskDeleted);
      websocketService.off('schedule_cleared', handleScheduleCleared);
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

  const getDisplayValue = (task, columnKey) => {
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
      case 'start_date_contract':
      case 'end_date_contract':
      case 'start_date_plan':
      case 'end_date_plan':
        return task[columnKey] ? new Date(task[columnKey]).toLocaleDateString('ru-RU') : '-';
      default:
        return task[columnKey] !== undefined && task[columnKey] !== null ? String(task[columnKey]) : '-';
    }
  };

  const applyFilters = () => {
    let filtered = tasks;
    
    Object.entries(filters).forEach(([columnKey, filterValue]) => {
      if (filterValue && filterValue.trim() !== '') {
        filtered = filtered.filter(task => {
          const displayValue = getDisplayValue(task, columnKey);
          return displayValue.toLowerCase().includes(filterValue.toLowerCase());
        });
      }
    });
    
    setFilteredTasks(filtered);
  };

  const handleFilterApply = (columnKey, filterValue) => {
    setFilters(prev => ({
      ...prev,
      [columnKey]: filterValue
    }));
  };

  const handleClearAllFilters = () => {
    setFilters({});
    setShowFilterManager(false);
  };
  
  const getColumnValues = (columnKey) => {
    return tasks.map(task => getDisplayValue(task, columnKey));
  };
  
  const handleCellDoubleClick = (task, columnKey) => {
    if (!isAdmin) return;
    if (columnKey !== 'start_date_plan' && columnKey !== 'end_date_plan') return;
    if (task.is_section) return;
    
    setEditingCell({ taskId: task.id, field: columnKey });
    const dateValue = task[columnKey] ? new Date(task[columnKey]).toISOString().split('T')[0] : '';
    setEditValue(dateValue);
  };
  
  const handleCellBlur = async () => {
    if (!editingCell) return;
    
    const task = tasks.find(t => t.id === editingCell.taskId);
    if (!task) return;
    
    const currentValue = task[editingCell.field] ? new Date(task[editingCell.field]).toISOString().split('T')[0] : '';
    if (editValue === currentValue) {
      setEditingCell(null);
      return;
    }
    
    try {
      const updateData = {
        [editingCell.field]: editValue || null
      };
      
      await scheduleAPI.updateTask(editingCell.taskId, updateData);
      
      setTasks(prevTasks => 
        prevTasks.map(t => 
          t.id === editingCell.taskId 
            ? { ...t, [editingCell.field]: editValue || null }
            : t
        )
      );
      
      setEditingCell(null);
    } catch (error) {
      console.error('Ошибка обновления даты:', error);
      setEditingCell(null);
    }
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleCellBlur();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };
  
  const getCellValue = (task, columnKey) => {
    if (editingCell && editingCell.taskId === task.id && editingCell.field === columnKey) {
      return (
        <input
          type="date"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCellBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          style={{ width: '100%', padding: '4px' }}
        />
      );
    }
    
    const displayValue = getDisplayValue(task, columnKey);
    
    if (columnKey === 'name') {
      const hasActiveFilters = Object.values(filters).some(f => f && f.trim() !== '');
      const breadcrumb = hasActiveFilters ? getBreadcrumb(task) : '';
      return breadcrumb ? (
        <span>
          <span style={{ color: '#999', fontSize: '0.85em' }}>{breadcrumb}</span>
          {task.name}
        </span>
      ) : task.name;
    }
    
    return displayValue;
  };
  
  const getColumnLabel = (columnKey) => {
    const column = availableColumns.find(col => col.key === columnKey);
    return column ? column.label : columnKey;
  };
  
  const handleSaveColumnSettings = (newVisibleColumns) => {
    setVisibleColumns(newVisibleColumns);
    localStorage.setItem('scheduleVisibleColumns', JSON.stringify(newVisibleColumns));
  };
  
  const getRowStyle = (task) => {
    if (!task.is_section) return {};
    
    const color = SECTION_COLORS[task.level] || SECTION_COLORS[SECTION_COLORS.length - 1];
    return {
      backgroundColor: color,
      fontWeight: 'bold',
      fontSize: task.level === 0 ? '1.05em' : '1em'
    };
  };
  
  const getCellStyle = (task, columnKey) => {
    if (!isAdmin || task.is_section) return {};
    
    if (columnKey === 'start_date_plan' || columnKey === 'end_date_plan') {
      return {
        cursor: 'pointer',
        backgroundColor: editingCell?.taskId === task.id && editingCell?.field === columnKey ? '#ffffcc' : 'inherit'
      };
    }
    
    return {};
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
                      <ColumnFilter
                        columnKey={columnKey}
                        columnLabel={getColumnLabel(columnKey)}
                        allValues={getColumnValues(columnKey)}
                        currentFilter={filters[columnKey] || ''}
                        onApplyFilter={handleFilterApply}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map(task => (
                  <tr key={task.id} style={getRowStyle(task)}>
                    {visibleColumns.map(columnKey => (
                      <td 
                        key={columnKey} 
                        style={getCellStyle(task, columnKey)}
                        onDoubleClick={() => handleCellDoubleClick(task, columnKey)}
                        title={isAdmin && !task.is_section && (columnKey === 'start_date_plan' || columnKey === 'end_date_plan') ? 'Двойной клик для редактирования' : ''}
                      >
                        {getCellValue(task, columnKey)}
                      </td>
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

      {showFilterManager && (
        <FilterManager
          activeFilters={filters}
          onClearAll={handleClearAllFilters}
          onClose={() => setShowFilterManager(false)}
        />
      )}
    </div>
  );
}

export default Schedule;