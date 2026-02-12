import React, { useState, useEffect } from 'react';
import { dailyAPI, scheduleAPI } from '../services/api';
import websocketService from '../services/websocket';

function DailyOrders() {
  const [works, setWorks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    task_id: '',
    volume: '',
    description: ''
  });

  useEffect(() => {
    loadDailyWorks();
    loadTasks();
    
    // Подключаемся к WebSocket
    websocketService.connect();
    
    // Обработчики событий - теперь внутри useEffect чтобы видеть актуальный selectedDate
    const handleDailyWorkCreated = (message) => {
      console.log('Daily work created:', message.data);
      // loadDailyWorks теперь в замыкании и видит актуальный selectedDate
      loadDailyWorks();
    };
    
    const handleTaskUpdated = (message) => {
      console.log('Task updated, refreshing daily view:', message.data);
      loadDailyWorks();
      // Также обновляем список задач чтобы в модальном окне был актуальный факт
      loadTasks();
    };
    
    websocketService.on('daily_work_created', handleDailyWorkCreated);
    websocketService.on('task_updated', handleTaskUpdated);
    
    // Очистка при размонтировании или изменении selectedDate
    return () => {
      websocketService.off('daily_work_created', handleDailyWorkCreated);
      websocketService.off('task_updated', handleTaskUpdated);
    };
  }, [selectedDate]); // Пересоздаём обработчики при смене даты

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
      
      // СРАЗУ обновляем список локально
      await loadDailyWorks();
      await loadTasks();
      
      // WebSocket уведомления обновят другие устройства
    } catch (error) {
      alert('Ошибка при добавлении работы');
      console.error(error);
    }
  };

  const getTaskInfo = (taskId) => {
    return tasks.find(t => t.id === taskId);
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
        <button onClick={handleAddWork} className="btn-primary">
          + Внести объём
        </button>
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

      {/* Модальное окно для добавления работы */}
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
    </div>
  );
}

export default DailyOrders;
