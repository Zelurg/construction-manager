import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import '../styles/GanttChart.css';

const SECTION_COLORS = [
  '#B8D4E8', '#C8DFF0', '#D8EAF5', '#E4F1F8', '#EFF6FB',
];

function getSectionColor(level) {
  return SECTION_COLORS[Math.min(Math.max(level || 0, 0), SECTION_COLORS.length - 1)];
}

function getLevelFromCode(code) {
  if (!code) return 0;
  return String(code).split('.').length - 1;
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function trimNum(n) {
  return String(+n.toFixed(2));
}

// Смещение (в днях от minDate), на которое нужно прокрутить диаграмму,
// чтобы показать начало работы. Для недели/месяца/квартала/года —
// привязываем к началу соответствующего периода (границе колонки).
function computeScrollOffsetDays(start, minDate, scale) {
  const s = new Date(start); s.setHours(0, 0, 0, 0);
  const min = new Date(minDate); min.setHours(0, 0, 0, 0);
  let offset = Math.floor((s - min) / 864e5);
  if (scale === 'week') {
    offset = Math.floor(offset / 7) * 7;
  } else if (scale === 'month') {
    const pd = new Date(s.getFullYear(), s.getMonth(), 1);
    offset = Math.floor((pd - min) / 864e5);
  } else if (scale === 'quarter') {
    const pq = new Date(s.getFullYear(), Math.floor(s.getMonth() / 3) * 3, 1);
    offset = Math.floor((pq - min) / 864e5);
  } else if (scale === 'year') {
    const py = new Date(s.getFullYear(), 0, 1);
    offset = Math.floor((py - min) / 864e5);
  }
  return Math.max(0, offset);
}

const VALID_SCALES = ['year', 'quarter', 'month', 'week', 'day'];
const GANTT_SCALE_KEY = 'ganttScale';

// Ячейка ручного ввода объёма (вторая строка Ганта, масштаб «день»)
function VolumeCellInput({ value, onCommit }) {
  const [draft, setDraft] = useState(value != null ? String(value) : '');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value != null ? String(value) : '');
  }, [value, focused]);

  const commit = () => {
    const t = draft.trim();
    if (t === '') { onCommit(null); return; }
    const n = parseFloat(t);
    if (isNaN(n) || n <= 0) { onCommit(null); return; }
    onCommit(n);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.currentTarget.blur(); }
    else if (e.key === 'Escape') { setDraft(value != null ? String(value) : ''); e.currentTarget.blur(); }
  };

  return (
    <input
      className="gantt-volume-input"
      type="number"
      min="0"
      step="any"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); commit(); }}
      onKeyDown={handleKeyDown}
      onClick={e => e.stopPropagation()}
      title="Введите объём за этот день"
    />
  );
}

// Одна полоса Ганта (контракт или план) для задачи в режиме МСГ
function GanttBand({ task, type, minDate, maxDate, ppd, isDay, volumePlan, volumeData, onVolumeCommit }) {
  const startKey = type === 'contract' ? 'start_date_contract' : 'start_date_plan';
  const endKey   = type === 'contract' ? 'end_date_contract'   : 'end_date_plan';
  const start = task[startKey] ? new Date(task[startKey]) : null;
  const end   = task[endKey]   ? new Date(task[endKey])   : null;

  if (!start || !end) {
    return <div className={`gantt-band gantt-band-${type}`} />;
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const startOffset = Math.floor((start - minDate) / 864e5);
  const duration = Math.floor((end - start) / 864e5) + 1;
  const bg = type === 'contract' ? '#c9c9c9' : '#cfe3fb';

  // Не дневной масштаб — рисуем одну закрашенную полосу на весь диапазон дат
  if (!isDay) {
    return (
      <div className={`gantt-band gantt-band-${type}`}>
        <div
          className="gantt-band-block"
          style={{ left: startOffset * ppd, width: Math.max(duration * ppd, 6), backgroundColor: bg }}
          title={`${type === 'contract' ? 'Контракт' : 'План'}: ${start.toLocaleDateString('ru-RU')} — ${end.toLocaleDateString('ru-RU')}`}
        />
      </div>
    );
  }

  // Дневной масштаб — ячейка на каждый день диапазона.
  // Для плановой полосы ячейки ввода рисуем по всей видимой шкале диаграммы
  // (minDate..maxDate), чтобы фактические объёмы можно было вносить и вне
  // плановых дат. Дни планового диапазона — синим, вне плана — серым фоном.
  const cells = [];
  if (type === 'contract') {
    const perDay = (volumePlan > 0) ? volumePlan / duration : null;
    for (let i = 0; i < duration; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dateStr = toDateStr(d);
      const left = (startOffset + i) * ppd;
      cells.push(
        <div key={i} className="gantt-band-cell" style={{ left, width: ppd, backgroundColor: bg }}
          title={`${dateStr}: ${perDay != null ? trimNum(perDay) : 0}`}>
          <span className="gantt-distributed-value">{perDay != null ? trimNum(perDay) : ''}</span>
        </div>
      );
    }
  } else {
    const planStart = Math.floor((start - minDate) / 864e5);
    const planEnd   = Math.floor((end - minDate) / 864e5);
    const fullStart = Math.max(0, planStart);
    const range = maxDate ? Math.floor((maxDate - minDate) / 864e5) + 1 : planEnd + 1;
    const fullEnd = Math.max(planEnd, range - 1);
    for (let i = fullStart; i <= fullEnd; i++) {
      const d = new Date(minDate);
      d.setDate(minDate.getDate() + i);
      const dateStr = toDateStr(d);
      const left = i * ppd;
      const inPlan = i >= planStart && i <= planEnd;
      const cellBg = inPlan ? bg : '#f1f1f1';
      const current = volumeData?.[task.id]?.[dateStr] ?? null;
      cells.push(
        <div key={i} className="gantt-band-cell gantt-band-cell-editable" style={{ left, width: ppd, backgroundColor: cellBg }}>
          <VolumeCellInput value={current} onCommit={(v) => onVolumeCommit(task.id, dateStr, v)} />
        </div>
      );
    }
  }
  return <div className={`gantt-band gantt-band-${type}`}>{cells}</div>;
}

// Блок из двух полос (контракт + план), соответствует одной строке МСГ
function VolumeTaskBlock({ task, ppd, scale, minDate, maxDate, volumeData, onVolumeCommit }) {
  if (task.is_section) {
    return (
      <div className="gantt-task-block gantt-row-section"
        style={{ height: 48, backgroundColor: getSectionColor(getLevelFromCode(task.code)) }} />
    );
  }
  const isDay = scale === 'day';
  const volumePlan = task.volume_plan || 0;
  return (
    <div className="gantt-task-block" style={{ height: 48 }}>
      <GanttBand type="contract" task={task} minDate={minDate} maxDate={maxDate} ppd={ppd} isDay={isDay} volumePlan={volumePlan} />
      <GanttBand type="plan" task={task} minDate={minDate} maxDate={maxDate} ppd={ppd} isDay={isDay}
        volumePlan={volumePlan} volumeData={volumeData} onVolumeCommit={onVolumeCommit} />
    </div>
  );
}

function computeBarStyle(task, type, minDate, ppd) {
  const startKey = type === 'contract' ? 'start_date_contract' : 'start_date_plan';
  const endKey   = type === 'contract' ? 'end_date_contract'   : 'end_date_plan';
  if (!task[startKey] || !task[endKey]) return null;
  const start = new Date(task[startKey]); start.setHours(0,0,0,0);
  const end   = new Date(task[endKey]);   end.setHours(0,0,0,0);
  const startOffset = Math.floor((start - minDate) / (1000*60*60*24));
  const duration    = Math.floor((end - start) / (1000*60*60*24)) + 1;
  return {
    left: `${startOffset * ppd}px`,
    width: `${Math.max(duration * ppd, 6)}px`,
    top: type === 'contract' ? '4px' : '16px',
    height: '10px',
    backgroundColor: type === 'contract' ? '#aaa' : '#4a90e2',
    position: 'absolute',
    borderRadius: '3px',
    pointerEvents: 'none',
  };
}

// Обычный режим (вкладка «График») — одна строка на задачу с барами контракт+план
const GanttRow = React.memo(function GanttRow({ task, ppd, colWidth, minDate }) {
  const isSection = task.is_section;
  const sectionBg = isSection ? getSectionColor(getLevelFromCode(task.code)) : undefined;
  const contractStyle = !isSection ? computeBarStyle(task, 'contract', minDate, ppd) : null;
  const planStyle     = !isSection ? computeBarStyle(task, 'plan',     minDate, ppd) : null;
  const rowBg = isSection
    ? sectionBg
    : `repeating-linear-gradient(to right, transparent, transparent ${colWidth - 1}px, #f0f0f0 ${colWidth - 1}px, #f0f0f0 ${colWidth}px)`;

  return (
    <div className={`gantt-row-integrated${isSection ? ' gantt-row-section' : ''}`} style={{ background: rowBg }}>
      {!isSection && (
        <>
          {contractStyle && <div className="gantt-bar-contract" style={contractStyle}
            title={`Контракт: ${new Date(task.start_date_contract).toLocaleDateString('ru-RU')} — ${new Date(task.end_date_contract).toLocaleDateString('ru-RU')}`} />}
          {planStyle && <div className="gantt-bar-plan" style={planStyle}
            title={`План: ${new Date(task.start_date_plan).toLocaleDateString('ru-RU')} — ${new Date(task.end_date_plan).toLocaleDateString('ru-RU')}`} />}
        </>
      )}
    </div>
  );
});

function GanttChart({ tasks, externalScrollRef, volumeData, onVolumeCommit, volumeEnabled, scrollTarget }) {
  const [scale, setScale] = useState(() => {
    const saved = localStorage.getItem(GANTT_SCALE_KEY);
    return saved && VALID_SCALES.includes(saved) ? saved : 'month';
  });
  const internalScrollRef = useRef(null);
  const timelineScrollRef = useRef(null);
  const bodyScrollRef = externalScrollRef || internalScrollRef;

  const handleScaleChange = (newScale) => {
    setScale(newScale);
    localStorage.setItem(GANTT_SCALE_KEY, newScale);
  };

  const scaleConfig = {
    year:    { pixelsPerDay: 1,  label: 'Год',     format: (d) => d.getFullYear().toString() },
    quarter: { pixelsPerDay: 3,  label: 'Квартал', format: (d) => `Q${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()}` },
    month:   { pixelsPerDay: 5,  label: 'Месяц',   format: (d) => d.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' }) },
    week:    { pixelsPerDay: 15, label: 'Неделя',  format: (d) => `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}` },
    day:     { pixelsPerDay: 60, label: 'День',    format: (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) },
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
    const cfg = scaleConfig[scale];
    const timeMarks = [];
    let colWidth = cfg.pixelsPerDay;
    if (scale === 'day' || scale === 'week') {
      const step = scale === 'week' ? 7 : 1;
      colWidth = step * cfg.pixelsPerDay;
      for (let day = 0; day <= totalDays; day += step) {
        const md = new Date(minDate); md.setDate(md.getDate() + day);
        if (md <= maxDate) timeMarks.push({ date: new Date(md), dateStr: toDateStr(md), offset: day, label: cfg.format(md) });
      }
    } else {
      let cur = new Date(minDate);
      while (cur <= maxDate) {
        const offset = Math.ceil((cur - minDate) / (1000*60*60*24));
        let nextCur;
        if (scale === 'month')        nextCur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
        else if (scale === 'quarter') nextCur = new Date(cur.getFullYear(), cur.getMonth()+3, 1);
        else                          nextCur = new Date(cur.getFullYear()+1, 0, 1);
        const days = Math.ceil((nextCur - cur) / (1000*60*60*24));
        colWidth = days * cfg.pixelsPerDay;
        timeMarks.push({ date: new Date(cur), dateStr: toDateStr(cur), offset, label: cfg.format(cur), colWidth });
        cur = nextCur;
      }
      if (timeMarks.length > 0) colWidth = timeMarks[0].colWidth || colWidth;
    }
    return { minDate, maxDate, totalDays, timeMarks, colWidth };
  }, [tasks, scale]);

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

  // Прокрутка диаграммы к началу выбранной работы (по клику на строку таблицы)
  useEffect(() => {
    if (!scrollTarget || !chartData) return;
    const task = tasks.find(t => t.id === scrollTarget.id);
    if (!task || task.is_section) return;
    const startStr = task.start_date_plan || task.start_date_contract;
    if (!startStr) return;
    const ppd = scaleConfig[scale].pixelsPerDay;
    const offsetDays = computeScrollOffsetDays(startStr, chartData.minDate, scale);
    const target = Math.max(0, offsetDays * ppd - 40);
    const el = bodyScrollRef.current;
    if (el) el.scrollTo({ left: target, behavior: 'smooth' });
  }, [scrollTarget, chartData, scale, tasks]);

  const handleVolumeCommit = useCallback((taskId, dateStr, value) => {
    if (!volumeEnabled || !onVolumeCommit) return;
    onVolumeCommit(taskId, dateStr, value);
  }, [volumeEnabled, onVolumeCommit]);

  if (!chartData || tasks.length === 0) {
    return (
      <div className="gantt-chart-integrated">
        <div className="gantt-combined-header">
          <div className="gantt-controls-fixed">
            <div className="gantt-title">Диаграмма Ганта</div>
            <select className="gantt-scale-select" value={scale} onChange={e => handleScaleChange(e.target.value)}>
              {Object.keys(scaleConfig).map(k => <option key={k} value={k}>{scaleConfig[k].label}</option>)}
            </select>
          </div>
          <div className="gantt-timeline-row"><div className="gantt-empty-timeline">Нет данных</div></div>
        </div>
        <div className="gantt-empty">Нет данных для отображения</div>
      </div>
    );
  }

  const ppd = scaleConfig[scale].pixelsPerDay;
  const totalWidth = chartData.totalDays * ppd;
  const colWidth = chartData.colWidth;

  return (
    <div className="gantt-chart-integrated">
      <div className="gantt-combined-header">
        <div className="gantt-controls-row">
          <div className="gantt-title">Диаграмма Ганта</div>
          <select className="gantt-scale-select" value={scale} onChange={e => handleScaleChange(e.target.value)}>
            {Object.keys(scaleConfig).map(k => <option key={k} value={k}>{scaleConfig[k].label}</option>)}
          </select>
        </div>
        <div className="gantt-timeline-row" ref={timelineScrollRef}
          style={{ height: 24, overflowX: 'hidden', overflowY: 'hidden' }}>
          <div className="gantt-timeline-content" style={{ width: `${totalWidth}px` }}>
            <div style={{ position: 'relative', height: 24 }}>
              {chartData.timeMarks.map((mark, i) => (
                <div key={i} className="gantt-time-mark" style={{ left: `${mark.offset * ppd}px` }}>
                  <div className="gantt-time-label">{mark.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="gantt-body-scroll" ref={bodyScrollRef}>
        <div className="gantt-body-content" style={{ width: `${totalWidth}px` }}>
          {tasks.map(task => (
            volumeEnabled
              ? <VolumeTaskBlock
                  key={task.id || task.task_id}
                  task={task} ppd={ppd} scale={scale}
                  minDate={chartData.minDate} maxDate={chartData.maxDate} volumeData={volumeData}
                  onVolumeCommit={handleVolumeCommit}
                />
              : <GanttRow
                  key={task.id || task.task_id}
                  task={task} ppd={ppd} colWidth={colWidth} minDate={chartData.minDate}
                />
          ))}
        </div>
      </div>
    </div>
  );
}

export default GanttChart;