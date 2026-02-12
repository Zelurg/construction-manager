import React, { useState, useEffect } from 'react';
import { monthlyAPI } from '../services/api';
import websocketService from '../services/websocket';

function MonthlyOrder() {
  const [tasks, setTasks] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().substring(0, 7) + '-01'
  );

  useEffect(() => {
    loadMonthlyTasks();
    
    // Подключаемся к WebSocket
    websocketService.connect();
    
    // Обработчики событий
    const handleMonthlyTaskCreated = (message) => {
      console.log('Monthly task created:', message.data);
      // Перезагружаем данные для текущего месяца
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
            <th>Шифр</th>
            <th>Наименование</th>
            <th>Ед. изм.</th>
            <th>Объем план</th>
            <th>Объем факт</th>
            <th>Объем остаток</th>
            <th>Дата старта</th>
            <th>Дата финиша</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(task => (
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
  );
}

export default MonthlyOrder;
