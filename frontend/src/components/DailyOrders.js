import React, { useState, useEffect } from 'react';
import { dailyAPI } from '../services/api';
import websocketService from '../services/websocket';

function DailyOrders() {
  const [works, setWorks] = useState([]);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  useEffect(() => {
    loadDailyWorks();
    
    // Подключаемся к WebSocket
    websocketService.connect();
    
    // Обработчики событий
    const handleDailyWorkCreated = (message) => {
      console.log('Daily work created:', message.data);
      loadDailyWorks();
    };
    
    const handleTaskUpdated = (message) => {
      console.log('Task updated, refreshing daily view:', message.data);
      loadDailyWorks();
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
      </div>

      <div className="table-container">
        <table className="tasks-table">
          <thead>
            <tr>
              <th>Шифр</th>
              <th>Наименование</th>
              <th>Ед. изм.</th>
              <th>Объем</th>
              <th>Описание</th>
            </tr>
          </thead>
          <tbody>
            {works.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>
                  Нет данных за выбранную дату
                </td>
              </tr>
            ) : (
              works.map(work => (
                <tr key={work.id}>
                  <td>{work.code}</td>
                  <td>{work.name}</td>
                  <td>{work.unit}</td>
                  <td>{work.volume}</td>
                  <td>{work.description || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DailyOrders;
