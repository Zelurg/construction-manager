import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import '../styles/GanttChart.css';

const SECTION_COLORS = [
  '#B8D4E8', '#C8DFF0', '#D8EAF5', '#E4F1F8', '#EFF6FB',
];

function getSectionColor(level) {
  return SECTION_COLORS[Math.min(Math.max(level || 0, 0), SECTION_COLORS.length - 1)];
}

const VALID_SCALES = ['year', 'quarter', 'month', 'week', 'day'];
const GANTT_SCALE_KEY = 'ganttScale';

function HeadcountModal({ task, date, current, onSave, onClose }) {
  const [value, setValue] = useState(current ? String(current) : '');
  const inputRef = useRef(null);
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

  const handleSave = () => {
    const n = parseInt(value, 10);
    if (!value || isNaN(n) || n <= 0) { alert('\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0446\u0435\u043b\u043e\u0435 \u0447\u0438\u0441\u043b\u043e \u0431\u043e\u043b\u044c\u0448\u0435 0'); return; }
    onSave(n);
  };
  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); };
  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', minWidth: 320, boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>\u041d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u043b\u044e\u0434\u0435\u0439</div>
        <div style={{ color: '#555', fontSize: 13, marginBottom: 4 }}><b>\u0420\u0430\u0431\u043e\u0442\u0430:</b> {task.name}</div>
        <div style={{ color: '#555', fontSize: 13, marginBottom: 16 }}><b>\u0414\u0430\u0442\u0430:</b> {dateLabel}</div>
        <input ref={inputRef} type="number" min="1" step="1" value={value}
          onChange={e => setValue(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="\u041a\u043e\u043b-\u0432\u043e \u043b\u044e\u0434\u0435\u0439"
          style={{ width: '100%', padding: '8px 10px', fontSize: 15, border: '1.5px solid #4a90e2', borderRadius: 5, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 18px', borderRadius: 5, border: '1px solid #ccc', background: '#f5f5f5', cursor: 'pointer', fontSize: 13 }}>\u041e\u0442\u043c\u0435\u043d\u0430</button>
          <button onClick={handleSave} style={{ padding: '7px 18px', borderRadius: 5, border: 'none', background: '#4a90e2', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c</button>
        </div>
      </div>
    </div>
  );
}

// onTotalsRowChange(bool) — уведомляет родителя о смене высоты шапки
function GanttChart({ tasks, externalScrollRef, headcountData, onHeadcountSave, headcountEnabled, onTotalsRowChange }) {
  const [scale, setScale] = useState(() => {
    const saved = localStorage.getItem(GANTT_SCALE_KEY);
    return saved && VALID_SCALES.includes(saved) ? saved : 'month';
  });
  const [modal, setModal] = useState(null);
  const internalScrollRef = useRef(null);
  const timelineScrollRef = useRef(null);
  const bodyScrollRef = externalScrollRef || internalScrollRef;

  const handleScaleChange = (newScale) => {
    setScale(newScale);
    localStorage.setItem(GANTT_SCALE_KEY, newScale);
  };

  const scaleConfig = {
    year:    { pixelsPerDay: 1,  label: '\u0413\u043e\u0434',     format: (d) => d.getFullYear().toString() },
    quarter: { pixelsPerDay: 3,  label: '\u041a\u0432\u0430\u0440\u0442\u0430\u043b', format: (d) => `Q${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()}` },
    month:   { pixelsPerDay: 5,  label: '\u041c\u0435\u0441\u044f\u0446',   format: (d) => d.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' }) },
    week:    { pixelsPerDay: 15, label: '\u041d\u0435\u0434\u0435\u043b\u044f',  format: (d) => `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}` },
    day:     { pixelsPerDay: 60, label: '\u0414\u0435\u043d\u044c',    format: (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) },
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
    minDate.setHours(0,0,0,0); maxDate.setHours(23,59,59,999);
    const totalDays = Math.ceil((maxDate - minDate) / (1000*60*60*24)) + 1;
    const timeMarks = [];
    const cfg = scaleConfig[scale];
    if (scale === 'day' || scale === 'week') {
      const step = scale === 'week' ? 7 : 1;
      for (let day = 0; day <= totalDays; day += step) {
        const md = new Date(minDate); md.setDate(md.getDate() + day);
        if (md <= maxDate) timeMarks.push({ date: new Date(md), offset: day, label: cfg.format(md) });
      }
    } else {
      let cur = new Date(minDate);
      while (cur <= maxDate) {
        const offset = Math.ceil((cur - minDate) / (1000*60*60*24));
        timeMarks.push({ date: new Date(cur), offset, label: cfg.format(cur) });
        if (scale === 'month')        cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
        else if (scale === 'quarter') cur = new Date(cur.getFullYear(), cur.getMonth()+3, 1);
        else                          cur = new Date(cur.getFullYear()+1, 0, 1);
      }
    }
    return { minDate, maxDate, totalDays, timeMarks };
  }, [tasks, scale]);

  // Строка итогов МСГ: только когда headcountEnabled=true и масштаб день
  const showTotalsRow = Boolean(headcountEnabled && scale === 'day');

  // Уведомляем родителя (MonthlyOrder) об изменении высоты шапки
  useEffect(() => {
    if (onTotalsRowChange) onTotalsRowChange(showTotalsRow);
  }, [showTotalsRow, onTotalsRowChange]);

  const dailyTotals = useMemo(() => {
    if (!headcountData || !showTotalsRow) return {};
    const totals = {};
    Object.values(headcountData).forEach(byDate => {
      Object.entries(byDate).forEach(([ds, count]) => {
        totals[ds] = (totals[ds] || 0) + count;
      });
    });
    return totals;
  }, [headcountData, showTotalsRow]);

  const toDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  };

  useEffect(() => {
    const bodyEl = bodyScrollRef.current;
    const timeEl = timelineScrollRef.current;
    if (!bodyEl || !timeEl) return;
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => { timeEl.scrollLeft = bodyEl.scrollLeft; ticking = false; });
        ticking = true;
      }
    };
    bodyEl.addEventListener('scroll', onScroll, { passive: true });
    return () => bodyEl.removeEventListener('scroll', onScroll);
  }, [chartData]);

  const handleCellClick = useCallback((task, dateStr) => {
    if (!headcountEnabled || scale !== 'day' || task.is_section) return;
    setModal({ task, dateStr, current: headcountData?.[task.id]?.[dateStr] });
  }, [headcountEnabled, scale, headcountData]);

  const handleModalSave = (count) => {
    if (modal && onHeadcountSave) onHeadcountSave(modal.task.id, modal.dateStr, count);
    setModal(null);
  };

  // Высота таймлайна: 24px базовый + 24px строка итогов если есть
  const timelineRowHeight = showTotalsRow ? 48 : 24;

  if (!chartData || tasks.length === 0) {
    return (
      <div className="gantt-chart-integrated">
        <div className="gantt-combined-header">
          <div className="gantt-controls-fixed">
            <div className="gantt-title">\u0414\u0438\u0430\u0433\u0440\u0430\u043c\u043c\u0430 \u0413\u0430\u043d\u0442\u0430</div>
            <select className="gantt-scale-select" value={scale} onChange={e => handleScaleChange(e.target.value)}>
              {Object.keys(scaleConfig).map(k => <option key={k} value={k}>{scaleConfig[k].label}</option>)}
            </select>
          </div>
          <div className="gantt-timeline-row"><div className="gantt-empty-timeline">\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445</div></div>
        </div>
        <div className="gantt-empty">\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u0434\u043b\u044f \u043e\u0442\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u044f</div>
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
    const start = new Date(task[startKey]); start.setHours(0,0,0,0);
    const end   = new Date(task[endKey]);   end.setHours(0,0,0,0);
    const startOffset = Math.floor((start - chartData.minDate) / (1000*60*60*24));
    const duration    = Math.floor((end - start) / (1000*60*60*24)) + 1;
    return {
      left: `${startOffset * ppd}px`,
      width: `${Math.max(duration * ppd, 6)}px`,
      top: type === 'contract' ? '4px' : '16px',
      height: '10px',
      backgroundColor: type === 'contract' ? '#aaa' : '#4a90e2',
      position: 'absolute',
      borderRadius: '3px',
      pointerEvents: 'none',  // Клики проходят сквозь бар на grid-ячейку
    };
  };

  return (
    <>
      <div className="gantt-chart-integrated">
        <div className="gantt-combined-header">
          <div className="gantt-controls-row">
            <div className="gantt-title">\u0414\u0438\u0430\u0433\u0440\u0430\u043c\u043c\u0430 \u0413\u0430\u043d\u0442\u0430</div>
            <select className="gantt-scale-select" value={scale} onChange={e => handleScaleChange(e.target.value)}>
              {Object.keys(scaleConfig).map(k => <option key={k} value={k}>{scaleConfig[k].label}</option>)}
            </select>
          </div>
          <div className="gantt-timeline-row" ref={timelineScrollRef}
            style={{ height: `${timelineRowHeight}px`, overflowX: 'hidden', overflowY: 'hidden' }}>
            <div className="gantt-timeline-content" style={{ width: `${totalWidth}px` }}>
              {/* Строка дат */}
              <div style={{ position: 'relative', height: 24 }}>
                {chartData.timeMarks.map((mark, i) => (
                  <div key={i} className="gantt-time-mark" style={{ left: `${mark.offset * ppd}px` }}>
                    <div className="gantt-time-label">{mark.label}</div>
                  </div>
                ))}
              </div>
              {/* Строка итогов МСГ (только при headcountEnabled + день) */}
              {showTotalsRow && (
                <div style={{ position: 'relative', height: 24, borderTop: '1px solid #d0d9e8', background: '#eaf3fb' }}>
                  {chartData.timeMarks.map((mark, i) => {
                    const ds = toDateStr(mark.date);
                    const total = dailyTotals[ds];
                    return (
                      <div key={i} style={{
                        position: 'absolute', left: `${mark.offset * ppd}px`, width: `${ppd}px`, height: '24px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: total ? 700 : 400, color: total ? '#1a5fa8' : '#aaa',
                        borderRight: '1px solid #d0d9e8', boxSizing: 'border-box',
                      }}>
                        {total || ''}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="gantt-body-scroll" ref={bodyScrollRef}>
          <div className="gantt-body-content" style={{ width: `${totalWidth}px` }}>
            {tasks.map(task => {
              const isSection = task.is_section;
              const isClickable = headcountEnabled && scale === 'day' && !isSection;
              return (
                <div key={task.id || task.task_id}
                  className={`gantt-row-integrated${isSection ? ' gantt-row-section' : ''}`}
                  style={!isSection ? {} : { backgroundColor: getSectionColor(task.level) }}
                >
                  {/* Grid-ячейки — принимают клики в режиме headcount */}
                  {chartData.timeMarks.map((mark, idx) => {
                    const ds = toDateStr(mark.date);
                    const hc = isClickable ? (headcountData?.[task.id]?.[ds] || null) : null;
                    return (
                      <div key={idx} className="gantt-grid-line"
                        style={{
                          left: `${mark.offset * ppd}px`,
                          ...(isClickable ? {
                            width: `${ppd}px`,
                            cursor: 'pointer',
                            zIndex: 1,
                            pointerEvents: 'auto',
                            ...(hc ? {
                              background: 'rgba(74,144,226,0.18)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 700, color: '#1a5fa8',
                            } : {}),
                          } : { pointerEvents: 'none' }),
                        }}
                        title={isClickable ? (hc ? `${hc} \u0447\u0435\u043b. \u2014 \u043d\u0430\u0436\u043c\u0438\u0442\u0435 \u0434\u043b\u044f \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f` : '\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u0434\u043b\u044f \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f \u043b\u044e\u0434\u0435\u0439') : undefined}
                        onClick={isClickable ? () => handleCellClick(task, ds) : undefined}
                      >
                        {hc || ''}
                      </div>
                    );
                  })}
                  {/* Бары: pointerEvents none, чтобы клики проходили на grid-ячейку */}
                  {!isSection && (
                    <>
                      {getBarStyle(task, 'contract') && <div className="gantt-bar-contract" style={getBarStyle(task, 'contract')} title={`\u041a\u043e\u043d\u0442\u0440\u0430\u043a\u0442: ${new Date(task.start_date_contract).toLocaleDateString('ru-RU')} \u2014 ${new Date(task.end_date_contract).toLocaleDateString('ru-RU')}`} />}
                      {getBarStyle(task, 'plan') && <div className="gantt-bar-plan" style={getBarStyle(task, 'plan')} title={`\u041f\u043b\u0430\u043d: ${new Date(task.start_date_plan).toLocaleDateString('ru-RU')} \u2014 ${new Date(task.end_date_plan).toLocaleDateString('ru-RU')}`} />}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {modal && (
        <HeadcountModal task={modal.task} date={modal.dateStr} current={modal.current}
          onSave={handleModalSave} onClose={() => setModal(null)} />
      )}
    </>
  );
}

export default GanttChart;
