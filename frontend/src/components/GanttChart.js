import React, { useState, useMemo, useRef, useEffect } from 'react';
import '../styles/GanttChart.css';

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

  const dates = tasks.flatMap(t => [
    new Date(t.start_date),
    new Date(t.end_date)
  ]);
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  
  minDate.setHours(0, 0, 0, 0);
  maxDate.setHours(23, 59, 59, 999);
  
  const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;
  
  const timeMarks = [];
  const currentScale = scaleConfig[scale];
  
  // Генерация меток - ИСПРАВЛЕНО
  if (scale === 'day') {
    // Для дней - каждый день от начала
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
    // Для недель - каждые 7 дней
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
    // Для месяцев - начало каждого месяца
    let currentDate = new Date(minDate);
    
    while (currentDate <= maxDate) {
      const offset = Math.ceil((currentDate - minDate) / (1000 * 60 * 60 * 24));
      
      timeMarks.push({
        date: new Date(currentDate),
        offset: offset,
        label: currentScale.format(currentDate)
      });
      
      // Переход к 1-му числу следующего месяца
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    }
  } else if (scale === 'quarter') {
    // Для кварталов - начало каждого квартала
    let currentDate = new Date(minDate);
    
    while (currentDate <= maxDate) {
      const offset = Math.ceil((currentDate - minDate) / (1000 * 60 * 60 * 24));
      
      timeMarks.push({
        date: new Date(currentDate),
        offset: offset,
        label: currentScale.format(currentDate)
      });
      
      // Переход к следующему кварталу
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 3, 1);
    }
  } else if (scale === 'year') {
    // Для годов - начало каждого года
    let currentDate = new Date(minDate);
    
    while (currentDate <= maxDate) {
      const offset = Math.ceil((currentDate - minDate) / (1000 * 60 * 60 * 24));
      
      timeMarks.push({
        date: new Date(currentDate),
        offset: offset,
        label: currentScale.format(currentDate)
      });
      
      // Переход к следующему году
      currentDate = new Date(currentDate.getFullYear() + 1, 0, 1);
    }
  }

  return { minDate, maxDate, totalDays, timeMarks };
}, [tasks, scale]);

  // Синхронизация скролла - УЛУЧШЕННАЯ ВЕРСИЯ
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const timelineScroll = timelineScrollRef.current;

    if (!scrollContainer || !timelineScroll) {
      return;
    }

    let rafId = null;

    const handleScroll = () => {
      // Используем requestAnimationFrame для плавной синхронизации
      if (rafId) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        if (timelineScroll && scrollContainer) {
          timelineScroll.scrollLeft = scrollContainer.scrollLeft;
        }
      });
    };

    // Добавляем обработчик
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

    // Начальная синхронизация
    timelineScroll.scrollLeft = scrollContainer.scrollLeft;

    // Очистка
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

  const getBarStyle = (task) => {
    const start = new Date(task.start_date);
    const end = new Date(task.end_date);
    
    // Нормализуем даты - убираем время
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    // Вычисляем offset - используем Math.floor вместо Math.ceil
    const startOffset = Math.floor((start - chartData.minDate) / (1000 * 60 * 60 * 24));
    const duration = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    return {
      left: `${startOffset * pixelsPerDay}px`,
      width: `${Math.max(duration * pixelsPerDay, 10)}px`
    };
  };


  const getContainerWidth = () => {
    return chartData.totalDays * pixelsPerDay;
  };

    return (
    <div className="gantt-chart-integrated">
      {/* Комбинированная шапка - 2 строки по 35px */}
      <div className="gantt-combined-header">
        {/* Строка 1: Название + Select */}
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

        {/* Строка 2: Временная шкала */}
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

      {/* Тело диаграммы с барами */}
      <div className="gantt-body-scroll" ref={scrollContainerRef}>
        <div className="gantt-body-content" style={{ width: `${getContainerWidth()}px` }}>
          {tasks.map((task) => (
            <div key={task.id} className="gantt-row-integrated">
              {/* Вертикальные линии сетки */}
              {chartData.timeMarks.map((mark, idx) => (
                <div
                  key={idx}
                  className="gantt-grid-line"
                  style={{ left: `${mark.offset * pixelsPerDay}px` }}
                ></div>
              ))}
              
              {/* Бар задачи */}
              <div
                className="gantt-bar-integrated"
                style={getBarStyle(task)}
                title={`${task.name}\n${new Date(task.start_date).toLocaleDateString('ru-RU')} - ${new Date(task.end_date).toLocaleDateString('ru-RU')}`}
              >
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default GanttChart;
