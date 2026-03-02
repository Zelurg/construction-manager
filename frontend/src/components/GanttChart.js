import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { FixedSizeList } from 'react-window';
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

const VALID_SCALES = ['year', 'quarter', 'month', 'week', 'day'];
const GANTT_SCALE_KEY = 'ganttScale';
const ROW_HEIGHT = 32;

function HeadcountModal({ task, date, current, onSave, onClear, onClose }) {
  const [value, setValue] = useState(current != null ? String(current) : '');
  const inputRef = useRef(null);
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

  const handleSave = () => {
    const n = parseFloat(value);
    if (!value || isNaN(n) || n <= 0) { alert('Введите число больше 0'); return; }
    onSave(n);
  };
  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); };
  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const hasCurrent = current != null && current !== '';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', minWidth: 320, boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Назначение людей</div>
        <div style={{ color: '#555', fontSize: 13, marginBottom: 4 }}><b>Работа:</b> {task.name}</div>
        <div style={{ color: '#555', fontSize: 13, marginBottom: 16 }}><b>Дата:</b> {dateLabel}</div>
        <input
          ref={inputRef}
          type="number" min="0" step="0.5" value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Например: 0.5, 1, 2…"
          style={{ width: '100%', padding: '8px 10px', fontSize: 15, border: '1.5px solid #4a90e2', borderRadius: 5, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>Можно указывать дробные значения (0.5, 1.5, …)</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
          {hasCurrent ? (
            <button onClick={onClear} title="Удалить назначение"
              style={{ padding: '7px 14px', borderRadius: 5, border: '1px solid #e0a0a0', background: '#fff0f0', color: '#c0392b', cursor: 'pointer', fontSize: 13 }}>
              Очистить
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '7px 18px', borderRadius: 5, border: '1px solid #ccc', background: '#f5f5f5', cursor: 'pointer', fontSize: 13 }}>Отмена</button>
            <button onClick={handleSave} style={{ padding: '7px 18px', borderRadius: 5, border: 'none', background: '#4a90e2', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Сохранить</button>
          </div>
        </div>
      </div>
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

const GanttRow = React.memo(function GanttRow({
  task, ppd, colWidth, headcountEnabled, scale,
  taskHeadcount, minDate, timeMarks, onCellClick,
}) {
  const isSection = task.is_section;
  const isClickable = headcountEnabled && scale === 'day' && !isSection;
  const sectionBg = isSection ? getSectionColor(getLevelFromCode(task.code)) : undefined;

  const contractStyle = !isSection ? computeBarStyle(task, 'contract', minDate, ppd) : null;
  const planStyle     = !isSection ? computeBarStyle(task, 'plan',     minDate, ppd) : null;

  const rowBg = isSection
    ? sectionBg
    : `repeating-linear-gradient(to right, transparent, transparent ${colWidth - 1}px, #f0f0f0 ${colWidth - 1}px, #f0f0f0 ${colWidth}px)`;

  return (
    <div
      className={`gantt-row-integrated${isSection ? ' gantt-row-section' : ''}`}
      style={{ background: rowBg }}
    >
      {isClickable && timeMarks.map((mark, idx) => {
        const hc = taskHeadcount?.[mark.dateStr] ?? null;
        return (
          <div key={idx}
            className="gantt-headcount-cell"
            style={{
              left: `${mark.offset * ppd}px`,
              width: `${ppd}px`,
              ...(hc != null ? {
                background: 'rgba(74,144,226,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: '#1a5fa8',
              } : {}),
            }}
            title={hc != null ? `${hc} чел. — нажмите для изменения` : 'Нажмите для назначения людей'}
            onClick={() => onCellClick(task, mark.dateStr)}
          >
            {hc != null ? String(hc) : ''}
          </div>
        );
      })}
      {!isSection && (
        <>
          {contractStyle && (
            <div className="gantt-bar-contract" style={contractStyle}
              title={`Контракт: ${new Date(task.start_date_contract).toLocaleDateString('ru-RU')} — ${new Date(task.end_date_contract).toLocaleDateString('ru-RU')}`} />
          )}
          {planStyle && (
            <div className="gantt-bar-plan" style={planStyle}
              title={`План: ${new Date(task.start_date_plan).toLocaleDateString('ru-RU')} — ${new Date(task.end_date_plan).toLocaleDateString('ru-RU')}`} />
          )}
        </>
      )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.task === next.task &&
    prev.taskHeadcount === next.taskHeadcount &&
    prev.ppd === next.ppd &&
    prev.colWidth === next.colWidth &&
    prev.scale === next.scale &&
    prev.headcountEnabled === next.headcountEnabled &&
    prev.minDate === next.minDate &&
    prev.timeMarks === next.timeMarks
  );
});

function GanttChart({ tasks, externalScrollRef, headcountData, onHeadcountSave, headcountEnabled, onTotalsRowChange }) {
  const [scale, setScale] = useState(() => {
    const saved = localStorage.getItem(GANTT_SCALE_KEY);
    return saved && VALID_SCALES.includes(saved) ? saved : 'month';
  });
  const [modal, setModal] = useState(null);
  const [listHeight, setListHeight] = useState(400);

  const internalScrollRef = useRef(null);
  const timelineScrollRef = useRef(null);
  const listOuterRef = useRef(null); // outer div FixedSizeList — используем как bodyScrollRef
  const containerRef = useRef(null);

  // externalScrollRef — это ref из Schedule.js для синхронизации scrollTop.
  // Передаём его в outerRef чтобы Schedule мог читать/писать scrollTop.
  const bodyScrollRef = externalScrollRef || listOuterRef;

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

  // Отслеживаем высоту контейнера чтобы FixedSizeList знал свою высоту
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setListHeight(entry.contentRect.height);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

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
    const toDateStr = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,'0');
      const day = String(d.getDate()).padStart(2,'0');
      return `${y}-${m}-${day}`;
    };
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

  const showTotalsRow = Boolean(headcountEnabled && scale === 'day');

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

  // Синхронизация горизонтального скролла timeline с телом ганта
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
    setModal({ task, dateStr, current: headcountData?.[task.id]?.[dateStr] ?? null });
  }, [headcountEnabled, scale, headcountData]);

  const handleModalSave = (count) => {
    if (modal && onHeadcountSave) onHeadcountSave(modal.task.id, modal.dateStr, count);
    setModal(null);
  };
  const handleModalClear = () => {
    if (modal && onHeadcountSave) onHeadcountSave(modal.task.id, modal.dateStr, null);
    setModal(null);
  };

  // itemData — объект который передаётся в каждую строку через react-window.
  // Важно: мемоизируем чтобы не сбрасывать React.memo в GanttRow
  const itemData = useMemo(() => ({
    tasks,
    ppd: chartData?.colWidth ? scaleConfig[scale].pixelsPerDay : (scaleConfig[scale]?.pixelsPerDay ?? 5),
    colWidth: chartData?.colWidth ?? 5,
    headcountEnabled,
    scale,
    headcountData,
    minDate: chartData?.minDate,
    timeMarks: chartData?.timeMarks,
    onCellClick: handleCellClick,
  }), [tasks, chartData, scale, headcountEnabled, headcountData, handleCellClick]);

  const timelineRowHeight = showTotalsRow ? 48 : 24;

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
    <>
      <div className="gantt-chart-integrated">
        <div className="gantt-combined-header">
          <div className="gantt-controls-row">
            <div className="gantt-title">Диаграмма Ганта</div>
            <select className="gantt-scale-select" value={scale} onChange={e => handleScaleChange(e.target.value)}>
              {Object.keys(scaleConfig).map(k => <option key={k} value={k}>{scaleConfig[k].label}</option>)}
            </select>
          </div>
          <div className="gantt-timeline-row" ref={timelineScrollRef}
            style={{ height: `${timelineRowHeight}px`, overflowX: 'hidden', overflowY: 'hidden' }}>
            <div className="gantt-timeline-content" style={{ width: `${totalWidth}px` }}>
              <div style={{ position: 'relative', height: 24 }}>
                {chartData.timeMarks.map((mark, i) => (
                  <div key={i} className="gantt-time-mark" style={{ left: `${mark.offset * ppd}px` }}>
                    <div className="gantt-time-label">{mark.label}</div>
                  </div>
                ))}
              </div>
              {showTotalsRow && (
                <div style={{ position: 'relative', height: 24, borderTop: '1px solid #d0d9e8', background: '#eaf3fb' }}>
                  {chartData.timeMarks.map((mark, i) => {
                    const total = dailyTotals[mark.dateStr];
                    const label = total ? (Number.isInteger(total) ? total : +total.toFixed(2)) : '';
                    return (
                      <div key={i} style={{
                        position: 'absolute', left: `${mark.offset * ppd}px`, width: `${ppd}px`, height: '24px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: total ? 700 : 400, color: total ? '#1a5fa8' : '#aaa',
                        borderRight: '1px solid #d0d9e8', boxSizing: 'border-box',
                      }}>{label}</div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Контейнер для измерения высоты и передачи в FixedSizeList */}
        <div className="gantt-body-scroll" ref={containerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <FixedSizeList
            height={listHeight}
            itemCount={tasks.length}
            itemSize={ROW_HEIGHT}
            itemData={itemData}
            width="100%"
            outerRef={bodyScrollRef}
            outerElementType="div"
            style={{ overflowX: 'auto', overflowY: 'auto' }}
            innerElementType={({ children, style, ...rest }) => (
              // innerElement — внутренний div со всеми строками.
              // задаём минимальную ширину = totalWidth чтобы горизонтальный скролл работал
              <div style={{ ...style, minWidth: `${totalWidth}px`, position: 'relative' }} {...rest}>
                {children}
              </div>
            )}
          >
            {RowRenderer}
          </FixedSizeList>
        </div>
      </div>

      {modal && (
        <HeadcountModal
          task={modal.task}
          date={modal.dateStr}
          current={modal.current}
          onSave={handleModalSave}
          onClear={handleModalClear}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

// RowRenderer вынесен за пределы GanttChart чтобы не пересоздаваться при каждом рендере.
// react-window передаёт { index, style, data } в каждую строку.
const RowRenderer = React.memo(function RowRenderer({ index, style, data }) {
  const { tasks, ppd, colWidth, headcountEnabled, scale, headcountData, minDate, timeMarks, onCellClick } = data;
  const task = tasks[index];
  return (
    // style от react-window задаёт position:absolute + top для виртуального позиционирования
    <div style={{ ...style, width: '100%' }}>
      <GanttRow
        task={task}
        ppd={ppd}
        colWidth={colWidth}
        headcountEnabled={headcountEnabled}
        scale={scale}
        taskHeadcount={headcountData?.[task.id]}
        minDate={minDate}
        timeMarks={timeMarks}
        onCellClick={onCellClick}
      />
    </div>
  );
});

export default GanttChart;
