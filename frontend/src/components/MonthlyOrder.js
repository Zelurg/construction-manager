import React, { useState, useEffect } from 'react';
import { monthlyAPI, scheduleAPI } from '../services/api';
import websocketService from '../services/websocket';
import ColumnSettings from './ColumnSettings';
import { useAuth } from '../contexts/AuthContext';

const SECTION_COLORS = [
  '#E8F4F8',  // level 0
  '#F0F8E8',  // level 1
  '#FFF4E6',  // level 2
  '#F8E8F4',  // level 3
  '#E8F0F8',  // level 4
];

function MonthlyOrder({ onShowColumnSettings }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  const [tasks, setTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().substring(0, 7) + '-01'
  );
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [editingCell, setEditingCell] = useState(null); // { taskId, field }
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
      // Мерджим данные вместо полной замены
      setTasks(prevTasks => 
        prevTasks.map(task => 
          task.task_id === message.data.id ? { ...task, ...message.data } : task
        )
      );
      setAllTasks(prevTasks => 
        prevTasks.map(task => 
          task.task_id === message.data.id ? { ...task, ...message.data } : task
        )
      );
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
  
  // Начало редактирования ячейки
  const handleCellDoubleClick = (task, columnKey) => {
    if (!isAdmin) return;
    if (columnKey !== 'start_date_plan' && columnKey !== 'end_date_plan') return;
    if (task.is_section) return;
    
    setEditingCell({ taskId: task.task_id, field: columnKey });
    const dateValue = task[columnKey] ? new Date(task[columnKey]).toISOString().split('T')[0] : '';
    setEditValue(dateValue);
  };
  
  // Сохранение изменений
  const handleCellBlur = async () => {
    if (!editingCell) return;
    
    const task = tasks.find(t => t.task_id === editingCell.taskId);
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
      
      // Обновляем локальное состояние с мерджом
      setTasks(prevTasks => 
        prevTasks.map(t => 
          t.task_id === editingCell.taskId 
            ? { ...t, [editingCell.field]: editValue || null }
            : t
        )
      );
      
      setEditingCell(null);
    } catch (error) {
      console.error('Ошибка обновления даты:', error);
      alert('Ошибка обновления даты');
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
    // Проверка на режим редактирования
    if (editingCell && editingCell.taskId === task.task_id && editingCell.field === columnKey) {
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
      case 'name':
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
  
  const getCellStyle = (task, columnKey) => {
    if (!isAdmin || task.is_section) return {};
    
    if (columnKey === 'start_date_plan' || columnKey === 'end_date_plan') {
      return {
        cursor: 'pointer',
        backgroundColor: editingCell?.taskId === task.task_id && editingCell?.field === columnKey ? '#ffffcc' : 'inherit'
      };
    }
    
    return {};
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

      {/* Добавлена обёртка с прокруткой */}
      <div className="table-container-scrollable">
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
