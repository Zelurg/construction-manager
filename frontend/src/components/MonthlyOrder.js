import React, { useState, useEffect } from 'react';
import { monthlyAPI } from '../services/api';
import websocketService from '../services/websocket';
import ColumnSettings from './ColumnSettings';

function MonthlyOrder({ onShowColumnSettings }) {
  const [tasks, setTasks] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().substring(0, 7) + '-01'
  );
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  
  // Доступные колонки для месячного наряда
  const availableColumns = [
    { key: 'code', label: 'Шифр', isBase: true },
    { key: 'name', label: 'Наименование', isBase: true },
    { key: 'unit', label: 'Ед. изм.', isBase: true },
    { key: 'volume_plan', label: 'Объем план', isBase: true },
    { key: 'volume_fact', label: 'Объем факт', isBase: true },
    { key: 'volume_remaining', label: 'Объем остаток', isBase: false, isCalculated: true },
    { key: 'start_date', label: 'Дата старта', isBase: true },
    { key: 'end_date', label: 'Дата финиша', isBase: true },
    // Новые атрибуты
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
  
  const defaultColumns = ['code', 'name', 'unit', 'volume_plan', 'volume_fact', 'volume_remaining', 'start_date', 'end_date'];
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('monthlyOrderVisibleColumns');
    return saved ? JSON.parse(saved) : defaultColumns;
  });

  // Пробрасываем функцию открытия настроек наверх
  useEffect(() => {
    if (onShowColumnSettings) {
      onShowColumnSettings(() => setShowColumnSettings(true));
    }
  }, [onShowColumnSettings]);

  useEffect(() => {
    loadMonthlyTasks();
    
    // Подключаемся к WebSocket
    websocketService.connect();
    
    // Обработчики событий
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
      setTasks(response.data);
    } catch (error) {
      console.error('Ошибка загрузки месячных задач:', error);
    }
  };
  
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
  
  const getColumnLabel = (columnKey) => {
    const column = availableColumns.find(col => col.key === columnKey);
    return column ? column.label : columnKey;
  };
  
  const handleSaveColumnSettings = (newVisibleColumns) => {
    setVisibleColumns(newVisibleColumns);
    localStorage.setItem('monthlyOrderVisibleColumns', JSON.stringify(newVisibleColumns));
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
            <tr key={task.id}>
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
