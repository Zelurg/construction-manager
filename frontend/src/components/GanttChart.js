import React, { useState, useMemo, useRef, useEffect } from 'react';
import '../styles/GanttChart.css';

// Пастельные цвета для разных уровней разделов (те же что в Schedule.js)
const SECTION_COLORS = [
  '#E8F4F8',  // level 0 - светло-голубой
  '#F0F8E8',  // level 1 - светло-зеленый
  '#FFF4E6',  // level 2 - светло-оранжевый
  '#F8E8F4',  // level 3 - светло-розовый
  '#E8F0F8',  // level 4 - светло-синий
];

function GanttChart({ tasks }) {
  const [scale, setScale] = useState('month');
  const scrollContainerRef = useRef(null);
  const timelineScrollRef = useRef(null);

  const scaleConfig = {
    year: { 
      pixelsPerDay: 1, 
      label: 'Год',
      gridUnit: 365,
      format: (date) => date.getFullYear().toString()
    },
    quarter: { 
      pixelsPerDay: 3, 
      label: 'Квартал',
      gridUnit: 90,
      format: (date) => `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`
    },
    month: { 
      pixelsPerDay: 5, 
      label: 'Месяц',
      gridUnit: 30,
      format: (date) => {
        const month = date.toLocaleDateString('ru-RU', { month: 'short' });
        const year = date.getFullYear();
        return `${month} ${year}`;
      }
    },
    week: { 
      pixelsPerDay: 15, 
      label: 'Неделя',
      gridUnit: 7,
      format: (date) => `${date.getDate()}.${String(date.getMonth() + 1).padStart(2, '0')}`
    },
    day: { 
      pixelsPerDay: 60, 
      label: 'День',
      gridUnit: 1,
      format: (date) => date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    }
  };

  const chartData = useMemo(() => {
    if (tasks.length === 0) return null;

    // Фильтруем только работы (не разделы) с плановыми датами для расчёта
    const workTasks = tasks.filter(t => !t.is_section && t.start_date_plan && t.end_date_plan);
    
    if (workTasks.length === 0) return null;

    // Используем контрактные И плановые даты для расчета диапазона
    const dates = workTasks.flatMap(t => {
      const datesToAdd = [];
      if (t.start_date_contract) datesToAdd.push(new Date(t.start_date_contract));
      if (t.end_date_contract) datesToAdd.push(new Date(t.end_date_contract));
      if (t.start_date_plan) datesToAdd.push(new Date(t.start_date_plan));
      if (t.end_date_plan) datesToAdd.push(new Date(t.end_date_plan));
      return datesToAdd;
    });
    
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    
    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(23, 59, 59, 999);
    
    const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;
    
    const timeMarks = [];
    const currentScale = scaleConfig[scale];
    
    // Генерация меток
    if (scale === 'day') {
      for (let day = 0; day <= totalDays; day += currentScale.gridUnit) {
        const markDate = new Date(minDate);
        markDate.setDate(markDate.getDate() + day);
        
        if (markDate <= maxDate) {
          timeMarks.push({
            date: new Date(markDate),
            offset: day,
            label: currentScale.format(markDate)
          });
        }
      }
    } else if (scale === 'week') {
      for (let day = 0; day <= totalDays; day += 7) {
        const markDate = new Date(minDate);
        markDate.setDate(markDate.getDate() + day);
        
        if (markDate <= maxDate) {
          timeMarks.push({
            date: new Date(markDate),
            offset: day,
            label: currentScale.format(markDate)
          });
        }
      }
    } else if (scale === 'month') {
      let currentDate = new Date(minDate);
      
      while (currentDate <= maxDate) {
        const offset = Math.ceil((currentDate - minDate) / (1000 * 60 * 60 * 24));
        
        timeMarks.push({
          date: new Date(currentDate),
          offset: offset,
          label: currentScale.format(currentDate)
        });
        
        currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
      }
    } else if (scale === 'quarter') {
      let currentDate = new Date(minDate);
      
      while (currentDate <= maxDate) {
        const offset = Math.ceil((currentDate - minDate) / (1000 * 60 * 60 * 24));
        
        timeMarks.push({
          date: new Date(currentDate),
          offset: offset,
          label: currentScale.format(currentDate)
        });
        
        currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 3, 1);
      }
    } else if (scale === 'year') {
      let currentDate = new Date(minDate);
      
      while (currentDate <= maxDate) {
        const offset = Math.ceil((currentDate - minDate) / (1000 * 60 * 60 * 24));
        
        timeMarks.push({
          date: new Date(currentDate),
          offset: offset,
          label: currentScale.format(currentDate)
        });
        
        currentDate = new Date(currentDate.getFullYear() + 1, 0, 1);
      }
    }

    return { minDate, maxDate, totalDays, timeMarks };
  }, [tasks, scale]);

  // Синхронизация скролла - улучшено для macOS
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const timelineScroll = timelineScrollRef.current;

    if (!scrollContainer || !timelineScroll) {
      return;
    }

    let rafId = null;
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        rafId = requestAnimationFrame(() => {
          if (timelineScroll && scrollContainer) {
            timelineScroll.scrollLeft = scrollContainer.scrollLeft;
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    // passive: false для лучшей работы на macOS с трекпадом
    scrollContainer.addEventListener('scroll', handleScroll, { passive: false });
    
    // Принудительная синхронизация при монтировании
    timelineScroll.scrollLeft = scrollContainer.scrollLeft;

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [chartData, tasks]);

  if (!chartData || tasks.length === 0) {
    return (
      <div className="gantt-chart-integrated">
        <div className="gantt-combined-header">
          <div className="gantt-controls-fixed">
            <div className="gantt-title">Диаграмма Ганта</div>
            <select 
              className="gantt-scale-select"
              value={scale}
              onChange={(e) => setScale(e.target.value)}
            >
              {Object.keys(scaleConfig).map(scaleKey => (
                <option key={scaleKey} value={scaleKey}>
                  {scaleConfig[scaleKey].label}
                </option>
              ))}
            </select>
          </div>
          <div className="gantt-timeline-scrollable">
            <div className="gantt-empty-timeline">Нет данных</div>
          </div>
        </div>
        <div className="gantt-empty">Нет данных для отображения</div>
      </div>
    );
  }

  const currentScale = scaleConfig[scale];
  const pixelsPerDay = currentScale.pixelsPerDay;

  // Стиль для контрактной полосы (серая, верхняя)
  const getContractBarStyle = (task) => {
    if (!task.start_date_contract || !task.end_date_contract) return null;
    
    const start = new Date(task.start_date_contract);
    const end = new Date(task.end_date_contract);
    
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    const startOffset = Math.floor((start - chartData.minDate) / (1000 * 60 * 60 * 24));
    const duration = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    return {
      left: `${startOffset * pixelsPerDay}px`,
      width: `${Math.max(duration * pixelsPerDay, 10)}px`,
      top: '3px',
      height: '12px',
      backgroundColor: '#999',
      position: 'absolute',
      borderRadius: '3px'
    };
  };

  // Стиль для плановой полосы (синяя, нижняя)
  const getPlanBarStyle = (task) => {
    if (!task.start_date_plan || !task.end_date_plan) return null;
    
    const start = new Date(task.start_date_plan);
    const end = new Date(task.end_date_plan);
    
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    const startOffset = Math.floor((start - chartData.minDate) / (1000 * 60 * 60 * 24));
    const duration = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    return {
      left: `${startOffset * pixelsPerDay}px`,
      width: `${Math.max(duration * pixelsPerDay, 10)}px`,
      top: '18px',
      height: '12px',
      backgroundColor: '#4a90e2',
      position: 'absolute',
      borderRadius: '3px'
    };
  };

  const getContainerWidth = () => {
    return chartData.totalDays * pixelsPerDay;
  };

  // Получение стилей строки для раздела
  const getRowStyle = (task) => {
    if (!task.is_section) return {};
    
    const color = SECTION_COLORS[task.level] || SECTION_COLORS[SECTION_COLORS.length - 1];
    return {
      backgroundColor: color
    };
  };

  return (
    <div className="gantt-chart-integrated">
      {/* Комбинированная шапка */}
      <div className="gantt-combined-header">
        <div className="gantt-controls-row">
          <div className="gantt-title">Диаграмма Ганта</div>
          <select 
            className="gantt-scale-select"
            value={scale}
            onChange={(e) => setScale(e.target.value)}
          >
            {Object.keys(scaleConfig).map(scaleKey => (
              <option key={scaleKey} value={scaleKey}>
                {scaleConfig[scaleKey].label}
              </option>
            ))}
          </select>
        </div>

        {/* Временная шкала */}
        <div className="gantt-timeline-row" ref={timelineScrollRef}>
          <div className="gantt-timeline-content" style={{ width: `${getContainerWidth()}px` }}>
            {chartData.timeMarks.map((mark, index) => (
              <div
                key={index}
                className="gantt-time-mark"
                style={{ left: `${mark.offset * pixelsPerDay}px` }}
              >
                <div className="gantt-time-label">{mark.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Тело диаграммы */}
      <div className="gantt-body-scroll" ref={scrollContainerRef}>
        <div className="gantt-body-content" style={{ width: `${getContainerWidth()}px` }}>
          {tasks.map((task) => (
            <div 
              key={task.id} 
              className={`gantt-row-integrated ${task.is_section ? 'gantt-row-section' : ''}`}
              style={getRowStyle(task)}
            >
              {/* Вертикальные линии сетки */}
              {chartData.timeMarks.map((mark, idx) => (
                <div
                  key={idx}
                  className="gantt-grid-line"
                  style={{ left: `${mark.offset * pixelsPerDay}px` }}
                ></div>
              ))}
              
              {/* Бары задачи - только для работ, не для разделов */}
              {!task.is_section && (
                <>
                  {/* Контрактная полоса (серая, верхняя) */}
                  {task.start_date_contract && task.end_date_contract && (
                    <div
                      className="gantt-bar-contract"
                      style={getContractBarStyle(task)}
                      title={`Контракт: ${task.name}\n${new Date(task.start_date_contract).toLocaleDateString('ru-RU')} - ${new Date(task.end_date_contract).toLocaleDateString('ru-RU')}`}
                    >
                    </div>
                  )}
                  
                  {/* Плановая полоса (синяя, нижняя) */}
                  {task.start_date_plan && task.end_date_plan && (
                    <div
                      className="gantt-bar-plan"
                      style={getPlanBarStyle(task)}
                      title={`План: ${task.name}\n${new Date(task.start_date_plan).toLocaleDateString('ru-RU')} - ${new Date(task.end_date_plan).toLocaleDateString('ru-RU')}`}
                    >
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default GanttChart;