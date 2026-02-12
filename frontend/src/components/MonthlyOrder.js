import React, { useState, useEffect } from 'react';
import { monthlyAPI } from '../services/api';
import websocketService from '../services/websocket';
import ColumnSettings from './ColumnSettings';

const SECTION_COLORS = [
  '#E8F4F8',  // level 0
  '#F0F8E8',  // level 1
  '#FFF4E6',  // level 2
  '#F8E8F4',  // level 3
  '#E8F0F8',  // level 4
];

function MonthlyOrder({ onShowColumnSettings }) {
  const [tasks, setTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().substring(0, 7) + '-01'
  );
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  
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
    const saved = localStorage.getItem('monthlyOrderVisibleColumns');
    return saved ? JSON.parse(saved) : defaultColumns;
  });

  useEffect(() => {
    if (onShowColumnSettings) {
      onShowColumnSettings(() => setShowColumnSettings(true));
    }
  }, [onShowColumnSettings]);

  useEffect(() => {
    loadMonthlyTasks();
    
    websocketService.connect();
    
    const handleMonthlyTaskCreated = (message) => {
      console.log('Monthly task created:', message.data);
      loadMonthlyTasks();
    };
    
    const handleTaskUpdated = (message) => {
      console.log('Task updated, refreshing monthly view:', message.data);
      loadMonthlyTasks();
    };
    
    websocketService.on('monthly_task_created', handleMonthlyTaskCreated);
    websocketService.on('task_updated', handleTaskUpdated);
    
    return () => {
      websocketService.off('monthly_task_created', handleMonthlyTaskCreated);
      websocketService.off('task_updated', handleTaskUpdated);
    };
  }, [selectedMonth]);

  const loadMonthlyTasks = async () => {
    try {
      const response = await monthlyAPI.getTasks(selectedMonth);
      const tasksData = response.data;
      setTasks(tasksData);
      setAllTasks(tasksData);
    } catch (error) {
      console.error('Ошибка загрузки месячных задач:', error);
    }
  };
  
  // Получение полного пути раздела (хлебные крошки)
  const getBreadcrumb = (task) => {
    if (!task.parent_code) return '';
    
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
        // Добавляем хлебные крошки для всех задач
        const breadcrumb = getBreadcrumb(task);
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
    localStorage.setItem('monthlyOrderVisibleColumns', JSON.stringify(newVisibleColumns));
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

  return (
    <div className="monthly-order">
      <div className="month-selector">
        <label>Выберите месяц:</label>
        <input 
          type="month" 
          value={selectedMonth.substring(0, 7)}
          onChange={(e) => setSelectedMonth(e.target.value + '-01')}
        />
      </div>

      <table className="tasks-table">
        <thead>
          <tr>
            {visibleColumns.map(columnKey => (
              <th key={columnKey}>{getColumnLabel(columnKey)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map(task => (
            <tr key={task.id} style={getRowStyle(task)}>
              {visibleColumns.map(columnKey => (
                <td key={columnKey}>{getCellValue(task, columnKey)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      
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

export default MonthlyOrder;
