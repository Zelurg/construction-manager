import React, { useState, useEffect, useRef } from 'react';
import { scheduleAPI } from '../services/api';
import websocketService from '../services/websocket';
import GanttChart from './GanttChart';

function Schedule({ showGantt }) {
  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [filters, setFilters] = useState({
    code: '',
    name: '',
    unit: ''
  });
  const [tableWidth, setTableWidth] = useState(60);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef(null);
  const tableScrollRef = useRef(null);
  const ganttScrollRef = useRef(null);

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
                  <th>
                    <div>Шифр</div>
                    <input 
                      type="text" 
                      placeholder="Фильтр..."
                      value={filters.code}
                      onChange={(e) => handleFilterChange('code', e.target.value)}
                    />
                  </th>
                  <th>
                    <div>Наименование</div>
                    <input 
                      type="text" 
                      placeholder="Фильтр..."
                      value={filters.name}
                      onChange={(e) => handleFilterChange('name', e.target.value)}
                    />
                  </th>
                  <th>
                    <div>Ед. изм.</div>
                    <input 
                      type="text" 
                      placeholder="Фильтр..."
                      value={filters.unit}
                      onChange={(e) => handleFilterChange('unit', e.target.value)}
                    />
                  </th>
                  <th>Объем<br/>план</th>
                  <th>Объем<br/>факт</th>
                  <th>Объем<br/>остаток</th>
                  <th>Дата<br/>старта</th>
                  <th>Дата<br/>финиша</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map(task => (
                  <tr key={task.id}>
                    <td>{task.code}</td>
                    <td>{task.name}</td>
                    <td>{task.unit}</td>
                    <td>{task.volume_plan}</td>
                    <td>{task.volume_fact}</td>
                    <td>{task.volume_plan - task.volume_fact}</td>
                    <td>{new Date(task.start_date).toLocaleDateString('ru-RU')}</td>
                    <td>{new Date(task.end_date).toLocaleDateString('ru-RU')}</td>
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
    </div>
  );
}

export default Schedule;
