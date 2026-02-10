import React, { useState, useEffect } from 'react';
import { dailyAPI, scheduleAPI } from '../services/api';

function DailyOrders() {
  const [works, setWorks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [newWork, setNewWork] = useState({
    task_id: '',
    volume: '',
    description: ''
  });

  useEffect(() => {
    loadDailyWorks();
    loadTasks();
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
      setTasks(response.data);
    } catch (error) {
      console.error('Ошибка загрузки задач:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await dailyAPI.createWork({
        ...newWork,
        task_id: parseInt(newWork.task_id),
        volume: parseFloat(newWork.volume),
        date: selectedDate
      });
      setNewWork({ task_id: '', volume: '', description: '' });
      loadDailyWorks();
    } catch (error) {
      console.error('Ошибка добавления работы:', error);
    }
  };

  return (
    <div className="daily-orders">
      <div className="date-selector">
        <label>Выберите дату:</label>
        <input 
          type="date" 
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>

      <div className="add-work-form">
        <h3>Добавить выполненную работу</h3>
        <form onSubmit={handleSubmit}>
          <select 
            value={newWork.task_id}
            onChange={(e) => setNewWork({...newWork, task_id: e.target.value})}
            required
          >
            <option value="">Выберите работу</option>
            {tasks.map(task => (
              <option key={task.id} value={task.id}>
                {task.code} - {task.name}
              </option>
            ))}
          </select>

          <input 
            type="number" 
            step="0.01"
            placeholder="Объем"
            value={newWork.volume}
            onChange={(e) => setNewWork({...newWork, volume: e.target.value})}
            required
          />

          <input 
            type="text" 
            placeholder="Описание (опционально)"
            value={newWork.description}
            onChange={(e) => setNewWork({...newWork, description: e.target.value})}
          />

          <button type="submit">Добавить</button>
        </form>
      </div>

      <div className="works-grid">
        {works.map(work => (
          <div key={work.id} className="work-card">
            <h4>{work.code}</h4>
            <p className="work-name">{work.name}</p>
            <div className="work-details">
              <span className="work-volume">{work.volume} {work.unit}</span>
              {work.description && (
                <p className="work-description">{work.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DailyOrders;
