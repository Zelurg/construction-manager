import React, { useState, useMemo, useRef, useEffect } from 'react';
import '../styles/GanttChart.css';

const SECTION_COLORS = [
  '#B8D4E8',
  '#C8DFF0',
  '#D8EAF5',
  '#E4F1F8',
  '#EFF6FB',
];

function getSectionColor(level) {
  const idx = Math.min(Math.max(level || 0, 0), SECTION_COLORS.length - 1);
  return SECTION_COLORS[idx];
}

/**
 * externalScrollRef — реф на gantt-body-scroll, переданный из Schedule/MonthlyOrder
 * для синхронизации вертикального скролла с таблицей.
 */
function GanttChart({ tasks, externalScrollRef }) {
  const [scale, setScale] = useState('month');
  const internalScrollRef = useRef(null);
  const timelineScrollRef = useRef(null);

  // Если снаружи передан реф — используем его, иначе внутренний
  const bodyScrollRef = externalScrollRef || internalScrollRef;

  const scaleConfig = {
    year:    { pixelsPerDay: 1,  label: 'Год',     gridUnit: 365, format: (d) => d.getFullYear().toString() },
    quarter: { pixelsPerDay: 3,  label: 'Квартал', gridUnit: 90,  format: (d) => `Q${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()}` },
    month:   { pixelsPerDay: 5,  label: 'Месяц',   gridUnit: 30,  format: (d) => d.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' }) },
    week:    { pixelsPerDay: 15, label: 'Неделя',  gridUnit: 7,   format: (d) => `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}` },
    day:     { pixelsPerDay: 60, label: 'День',    gridUnit: 1,   format: (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) },
  };

  const chartData = useMemo(() => {
    if (tasks.length === 0) return null;
    const workTasks = tasks.filter(t => !t.is_section && (t.start_date_plan || t.start_date_contract));
    if (workTasks.length === 0) return null;

    const dates = workTasks.flatMap(t => {
      const d = [];
      if (t.start_date_contract) d.push(new Date(t.start_date_contract));
      if (t.end_date_contract)   d.push(new Date(t.end_date_contract));
      if (t.start_date_plan)     d.push(new Date(t.start_date_plan));
      if (t.end_date_plan)       d.push(new Date(t.end_date_plan));
      return d;
    });

    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(23, 59, 59, 999);

    const totalDays = Math.ceil((maxDate - minDate) / (1000*60*60*24)) + 1;
    const timeMarks = [];
    const cfg = scaleConfig[scale];

    if (scale === 'day' || scale === 'week') {
      const step = scale === 'week' ? 7 : 1;
      for (let day = 0; day <= totalDays; day += step) {
        const md = new Date(minDate);
        md.setDate(md.getDate() + day);
        if (md <= maxDate) timeMarks.push({ date: new Date(md), offset: day, label: cfg.format(md) });
      }
    } else {
      let cur = new Date(minDate);
      while (cur <= maxDate) {
        const offset = Math.ceil((cur - minDate) / (1000*60*60*24));
        timeMarks.push({ date: new Date(cur), offset, label: cfg.format(cur) });
        if (scale === 'month')   cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
        else if (scale === 'quarter') cur = new Date(cur.getFullYear(), cur.getMonth() + 3, 1);
        else cur = new Date(cur.getFullYear() + 1, 0, 1);
      }
    }

    return { minDate, maxDate, totalDays, timeMarks };
  }, [tasks, scale]);

  // Синхронизация горизонтального скролла временной шкалы
  useEffect(() => {
    const bodyEl  = bodyScrollRef.current;
    const timeEl  = timelineScrollRef.current;
    if (!bodyEl || !timeEl) return;

    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          timeEl.scrollLeft = bodyEl.scrollLeft;
          ticking = false;
        });
        ticking = true;
      }
    };
    bodyEl.addEventListener('scroll', onScroll, { passive: true });
    return () => bodyEl.removeEventListener('scroll', onScroll);
  }, [chartData]);

  if (!chartData || tasks.length === 0) {
    return (
      <div className="gantt-chart-integrated">
        <div className="gantt-combined-header">
          <div className="gantt-controls-fixed">
            <div className="gantt-title">Диаграмма Ганта</div>
            <select className="gantt-scale-select" value={scale} onChange={e => setScale(e.target.value)}>
              {Object.keys(scaleConfig).map(k => <option key={k} value={k}>{scaleConfig[k].label}</option>)}
            </select>
          </div>
          <div className="gantt-timeline-row"><div className="gantt-empty-timeline">Нет данных</div></div>
        </div>
        <div className="gantt-empty">Нет данных для отображения</div>
      </div>
    );
  }

  const cfg = scaleConfig[scale];
  const ppd = cfg.pixelsPerDay;
  const totalWidth = chartData.totalDays * ppd;

  const getBarStyle = (task, type) => {
    const startKey = type === 'contract' ? 'start_date_contract' : 'start_date_plan';
    const endKey   = type === 'contract' ? 'end_date_contract'   : 'end_date_plan';
    if (!task[startKey] || !task[endKey]) return null;

    const start = new Date(task[startKey]);
    const end   = new Date(task[endKey]);
    start.setHours(0,0,0,0);
    end.setHours(0,0,0,0);

    const startOffset = Math.floor((start - chartData.minDate) / (1000*60*60*24));
    const duration    = Math.floor((end - start) / (1000*60*60*24)) + 1;

    return {
      left:            `${startOffset * ppd}px`,
      width:           `${Math.max(duration * ppd, 6)}px`,
      top:             type === 'contract' ? '4px' : '16px',
      height:          '10px',
      backgroundColor: type === 'contract' ? '#aaa' : '#4a90e2',
      position:        'absolute',
      borderRadius:    '3px',
    };
  };

  const getRowStyle = (task) => {
    if (!task.is_section) return {};
    return { backgroundColor: getSectionColor(task.level) };
  };

  return (
    <div className="gantt-chart-integrated">
      <div className="gantt-combined-header">
        <div className="gantt-controls-row">
          <div className="gantt-title">Диаграмма Ганта</div>
          <select className="gantt-scale-select" value={scale} onChange={e => setScale(e.target.value)}>
            {Object.keys(scaleConfig).map(k => <option key={k} value={k}>{scaleConfig[k].label}</option>)}
          </select>
        </div>
        <div className="gantt-timeline-row" ref={timelineScrollRef}>
          <div className="gantt-timeline-content" style={{ width: `${totalWidth}px` }}>
            {chartData.timeMarks.map((mark, i) => (
              <div key={i} className="gantt-time-mark" style={{ left: `${mark.offset * ppd}px` }}>
                <div className="gantt-time-label">{mark.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="gantt-body-scroll" ref={bodyScrollRef}>
        <div className="gantt-body-content" style={{ width: `${totalWidth}px` }}>
          {tasks.map(task => (
            <div
              key={task.id || task.task_id}
              className={`gantt-row-integrated ${task.is_section ? 'gantt-row-section' : ''}`}
              style={getRowStyle(task)}
            >
              {chartData.timeMarks.map((mark, idx) => (
                <div key={idx} className="gantt-grid-line" style={{ left: `${mark.offset * ppd}px` }} />
              ))}
              {!task.is_section && (
                <>
                  {getBarStyle(task, 'contract') && (
                    <div
                      className="gantt-bar-contract"
                      style={getBarStyle(task, 'contract')}
                      title={`Контракт: ${new Date(task.start_date_contract).toLocaleDateString('ru-RU')} — ${new Date(task.end_date_contract).toLocaleDateString('ru-RU')}`}
                    />
                  )}
                  {getBarStyle(task, 'plan') && (
                    <div
                      className="gantt-bar-plan"
                      style={getBarStyle(task, 'plan')}
                      title={`План: ${new Date(task.start_date_plan).toLocaleDateString('ru-RU')} — ${new Date(task.end_date_plan).toLocaleDateString('ru-RU')}`}
                    />
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
