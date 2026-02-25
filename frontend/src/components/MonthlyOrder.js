import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { scheduleAPI, employeesAPI, headcountAPI } from '../services/api';
import websocketService from '../services/websocket';
import GanttChart from './GanttChart';
import ColumnSettings from './ColumnSettings';
import ColumnFilter from './ColumnFilter';
import FilterManager from './FilterManager';
import PrintDialog from './PrintDialog';
import ChecklistStatus from './ChecklistStatus';
import { useAuth } from '../contexts/AuthContext';

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

const DEFAULT_COL_WIDTHS = {
  code: 90, name: 280, unit: 60, volume_plan: 90, volume_fact: 90,
  volume_remaining: 90, start_date_contract: 110, end_date_contract: 110,
  start_date_plan: 110, end_date_plan: 110, unit_price: 90,
  labor_per_unit: 100, machine_hours_per_unit: 110, executor: 150,
  labor_total: 100, labor_fact: 100, labor_remaining: 110,
  cost_total: 100, cost_fact: 100, cost_remaining: 110,
  machine_hours_total: 110, machine_hours_fact: 110, machine_hours_remaining: 120,
  checklist: 120,
};

function getParentIds(task, allTasks) {
  const ids = new Set();
  const parts = String(task.code).split('.');
  for (let len = parts.length - 1; len >= 1; len--) {
    const parentCode = parts.slice(0, len).join('.');
    const parent = allTasks.find(t => t.is_section && t.code === parentCode);
    if (parent) ids.add(parent.id);
  }
  return ids;
}

const STANDARD_EDITABLE = ['start_date_plan', 'end_date_plan', 'executor'];
const CUSTOM_EDITABLE = [
  'name', 'unit', 'volume_plan',
  'start_date_plan', 'end_date_plan',
  'unit_price', 'labor_per_unit', 'machine_hours_per_unit', 'executor',
];
const DATE_FIELDS = ['start_date_plan', 'end_date_plan', 'start_date_contract', 'end_date_contract'];
const NUMBER_FIELDS = ['volume_plan', 'unit_price', 'labor_per_unit', 'machine_hours_per_unit'];

const MONTH_STORAGE_KEY = 'monthlyOrderSelectedMonth';

function getInitialMonth() {
  try {
    const saved = localStorage.getItem(MONTH_STORAGE_KEY);
    if (saved && /^\d{4}-\d{2}$/.test(saved)) return saved;
  } catch { /* ignore */ }
  return new Date().toISOString().substring(0, 7);
}

const TaskRow = React.memo(function TaskRow({
  task, visibleColumns, isAdmin, isEditing, isSelected, isDragOver, dragOverPos,
  getRowStyle, getCellStyle, getCellValue, isFieldEditable,
  onRowClick, onCellDoubleClick,
  onDragStart, onDragOver, onDragLeave, onDragEnd, onDrop,
  onDeleteCustomRow,
}) {
  return (
    <tr
      style={getRowStyle(task)}
      onClick={() => onRowClick(task)}
      draggable={task.is_custom && isAdmin}
      onDragStart={e => onDragStart(e, task)}
      onDragOver={e => onDragOver(e, task)}
      onDragLeave={onDragLeave}
      onDragEnd={onDragEnd}
      onDrop={e => onDrop(e, task)}
    >
      {isAdmin && (
        <td style={{ width: 32, padding: '0 4px', textAlign: 'center' }}>
          {task.is_custom && (
            <button
              onClick={e => { e.stopPropagation(); onDeleteCustomRow(task.id); }}
              title="\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u0442\u0440\u043E\u043A\u0443"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e55', fontSize: 14, lineHeight: 1, padding: 2 }}
            >\u2715</button>
          )}
        </td>
      )}
      {visibleColumns.map(key => (
        <td key={key}
          style={getCellStyle(task, key)}
          onDoubleClick={() => onCellDoubleClick(task, key)}
          title={isFieldEditable(task, key) ? '\u0414\u0432\u043E\u0439\u043D\u043E\u0439 \u043A\u043B\u0438\u043A \u0434\u043B\u044F \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F' : ''}
        >
          {getCellValue(task, key)}
        </td>
      ))}
    </tr>
  );
});

function buildGanttHtml(tasks, ganttScale, ROW_H) {
  const SCALE_PPD = { year: 1, quarter: 3, month: 5, week: 15, day: 60 };
  const ppd = SCALE_PPD[ganttScale] || 5;

  const workTasks = tasks.filter(t => !t.is_section && (t.start_date_plan || t.start_date_contract));
  if (workTasks.length === 0) return '<p style="color:#999;font-size:11px;">\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u0434\u043B\u044F \u0434\u0438\u0430\u0433\u0440\u0430\u043C\u043C\u044B</p>';

  const allDates = [];
  workTasks.forEach(t => {
    if (t.start_date_contract) allDates.push(new Date(t.start_date_contract));
    if (t.end_date_contract)   allDates.push(new Date(t.end_date_contract));
    if (t.start_date_plan)     allDates.push(new Date(t.start_date_plan));
    if (t.end_date_plan)       allDates.push(new Date(t.end_date_plan));
  });
  if (allDates.length === 0) return '<p style="color:#999">\u041D\u0435\u0442 \u0434\u0430\u0442</p>';

  const minDate = new Date(Math.min(...allDates)); minDate.setHours(0, 0, 0, 0);
  const maxDate = new Date(Math.max(...allDates)); maxDate.setHours(23, 59, 59, 999);
  const totalDays = Math.ceil((maxDate - minDate) / 864e5) + 1;
  const totalWidth = totalDays * ppd;

  const timeMarks = [];
  if (ganttScale === 'day' || ganttScale === 'week') {
    const step = ganttScale === 'week' ? 7 : 1;
    for (let d = 0; d <= totalDays; d += step) {
      const md = new Date(minDate); md.setDate(md.getDate() + d);
      if (md <= maxDate) {
        const label = ganttScale === 'week'
          ? `${md.getDate()}.${String(md.getMonth() + 1).padStart(2, '0')}`
          : md.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        timeMarks.push({ offset: d, label });
      }
    }
  } else {
    let cur = new Date(minDate);
    while (cur <= maxDate) {
      const offset = Math.ceil((cur - minDate) / 864e5);
      let label = '';
      if (ganttScale === 'year')    label = cur.getFullYear().toString();
      if (ganttScale === 'quarter') label = `Q${Math.floor(cur.getMonth() / 3) + 1} ${cur.getFullYear()}`;
      if (ganttScale === 'month')   label = cur.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' });
      timeMarks.push({ offset, label });
      if (ganttScale === 'month')        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      else if (ganttScale === 'quarter') cur = new Date(cur.getFullYear(), cur.getMonth() + 3, 1);
      else                               cur = new Date(cur.getFullYear() + 1, 0, 1);
    }
  }

  const gridLines = timeMarks.map(m =>
    `<div style="position:absolute;left:${m.offset * ppd}px;top:0;bottom:0;border-left:1px solid #e0e0e0;pointer-events:none;"></div>`
  ).join('');
  const headerMarks = timeMarks.map(m =>
    `<div style="position:absolute;left:${m.offset * ppd}px;top:0;height:100%;border-left:1px solid #ccc;font-size:8px;padding-left:2px;white-space:nowrap;color:#333;">${m.label}</div>`
  ).join('');

  const headerTr = `<tr style="height:${ROW_H}px;">
    <td style="width:${totalWidth}px;min-width:${totalWidth}px;padding:0;background:#e0e8f5;border-bottom:1px solid #bbb;position:relative;overflow:hidden;">
      <div style="position:relative;width:${totalWidth}px;height:${ROW_H}px;">${headerMarks}</div>
    </td>
  </tr>`;

  const bodyRows = tasks.map(task => {
    const bgColor = task.is_section
      ? getSectionColor(getLevelFromCode(task.code))
      : (task.is_custom ? '#fff9e6' : '#fff');
    let bars = '';
    if (!task.is_section) {
      if (task.start_date_contract && task.end_date_contract) {
        const s = new Date(task.start_date_contract); s.setHours(0, 0, 0, 0);
        const e = new Date(task.end_date_contract);   e.setHours(0, 0, 0, 0);
        const left = Math.floor((s - minDate) / 864e5) * ppd;
        const w    = Math.max((Math.floor((e - s) / 864e5) + 1) * ppd, 4);
        bars += `<div style="position:absolute;left:${left}px;top:${Math.round(ROW_H * 0.15)}px;width:${w}px;height:${Math.round(ROW_H * 0.28)}px;background:#aaa;border-radius:2px;"></div>`;
      }
      if (task.start_date_plan && task.end_date_plan) {
        const s = new Date(task.start_date_plan); s.setHours(0, 0, 0, 0);
        const e = new Date(task.end_date_plan);   e.setHours(0, 0, 0, 0);
        const left = Math.floor((s - minDate) / 864e5) * ppd;
        const w    = Math.max((Math.floor((e - s) / 864e5) + 1) * ppd, 4);
        bars += `<div style="position:absolute;left:${left}px;top:${Math.round(ROW_H * 0.55)}px;width:${w}px;height:${Math.round(ROW_H * 0.28)}px;background:#4a90e2;border-radius:2px;"></div>`;
      }
    }
    return `<tr style="height:${ROW_H}px;">
      <td style="width:${totalWidth}px;min-width:${totalWidth}px;padding:0;background:${bgColor};border-bottom:1px solid #e8e8e8;position:relative;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
        <div style="position:relative;width:${totalWidth}px;height:${ROW_H}px;">${gridLines}${bars}</div>
      </td>
    </tr>`;
  }).join('');

  return `
    <table style="border-collapse:collapse;table-layout:fixed;">
      <thead>${headerTr}</thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div style="margin-top:6px;font-size:10px;color:#555;">
      <span style="display:inline-block;width:16px;height:8px;background:#aaa;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>\u041A\u043E\u043D\u0442\u0440\u0430\u043A\u0442
      &nbsp;&nbsp;
      <span style="display:inline-block;width:16px;height:8px;background:#4a90e2;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>\u041F\u043B\u0430\u043D
    </div>
  `;
}

function MonthlyOrder({ showGantt, onShowColumnSettings, onShowFilters, onShowPrint }) {
  const { user } = useAuth();
  const isAdmin = useMemo(() => user?.role === 'admin', [user]);

  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const [filters, setFilters] = useState({});

  const [selectedMonth, setSelectedMonthState] = useState(getInitialMonth);

  const setSelectedMonth = useCallback((month) => {
    setSelectedMonthState(month);
    try { localStorage.setItem(MONTH_STORAGE_KEY, month); } catch { /* ignore */ }
  }, []);

  const [tableWidth, setTableWidth] = useState(60);
  const [isResizing, setIsResizing] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showFilterManager, setShowFilterManager] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [employees, setEmployees] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [filterTriggers, setFilterTriggers] = useState({});

  const [headcountData, setHeadcountData] = useState({});
  const [ganttShowsTotals, setGanttShowsTotals] = useState(false);
  const tableHeaderHeight = ganttShowsTotals ? 84 : 60;

  const dragTaskIdRef = useRef(null);
  const [dragOverTaskId, setDragOverTaskId] = useState(null);
  const [dragOverPos, setDragOverPos] = useState('before');

  const [colWidths, setColWidths] = useState(() => {
    try {
      const s = localStorage.getItem('monthlyColWidths');
      return s ? { ...DEFAULT_COL_WIDTHS, ...JSON.parse(s) } : { ...DEFAULT_COL_WIDTHS };
    } catch { return { ...DEFAULT_COL_WIDTHS }; }
  });

  const allTasksRef = useRef([]);
  useEffect(() => { allTasksRef.current = tasks; }, [tasks]);

  const containerRef   = useRef(null);
  const tableScrollRef = useRef(null);
  const ganttBodyRef   = useRef(null);
  const syncingRef     = useRef(false);
  const colResizeRef   = useRef({ active: false, colKey: null, startX: 0, startWidth: 0 });
  const isDraggingRef  = useRef(false);

  const editValueRef = useRef('');
  useEffect(() => { editValueRef.current = editValue; }, [editValue]);
  const editingCellRef = useRef(null);
  useEffect(() => { editingCellRef.current = editingCell; }, [editingCell]);

  const availableColumns = useMemo(() => [
    { key: 'code',                    label: '\u0428\u0438\u0444\u0440' },
    { key: 'name',                    label: '\u041D\u0430\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D\u0438\u0435' },
    { key: 'checklist',               label: '\u0427\u0435\u043A-\u043B\u0438\u0441\u0442', isCalculated: true },
    { key: 'unit',                    label: '\u0415\u0434. \u0438\u0437\u043C.' },
    { key: 'volume_plan',             label: '\u041E\u0431\u044A\u0451\u043C \u043F\u043B\u0430\u043D' },
    { key: 'volume_fact',             label: '\u041E\u0431\u044A\u0451\u043C \u0444\u0430\u043A\u0442' },
    { key: 'volume_remaining',        label: '\u041E\u0431\u044A\u0451\u043C \u043E\u0441\u0442\u0430\u0442\u043E\u043A',  isCalculated: true },
    { key: 'start_date_contract',     label: '\u0421\u0442\u0430\u0440\u0442 \u043A\u043E\u043D\u0442\u0440\u0430\u043A\u0442' },
    { key: 'end_date_contract',       label: '\u0424\u0438\u043D\u0438\u0448 \u043A\u043E\u043D\u0442\u0440\u0430\u043A\u0442' },
    { key: 'start_date_plan',         label: '\u0421\u0442\u0430\u0440\u0442 \u043F\u043B\u0430\u043D',    editable: true },
    { key: 'end_date_plan',           label: '\u0424\u0438\u043D\u0438\u0448 \u043F\u043B\u0430\u043D',    editable: true },
    { key: 'unit_price',              label: '\u0426\u0435\u043D\u0430 \u0437\u0430 \u0435\u0434.' },
    { key: 'labor_per_unit',          label: '\u0422\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442\u044B/\u0435\u0434.' },
    { key: 'machine_hours_per_unit',  label: '\u041C\u0430\u0448\u0438\u043D\u043E\u0447\u0430\u0441\u044B/\u0435\u0434.' },
    { key: 'executor',                label: '\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C',           editable: true },
    { key: 'labor_total',             label: '\u0412\u0441\u0435\u0433\u043E \u0442\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442',   isCalculated: true },
    { key: 'labor_fact',              label: '\u0422\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442\u044B \u0444\u0430\u043A\u0442',   isCalculated: true },
    { key: 'labor_remaining',         label: '\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u0442\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442', isCalculated: true },
    { key: 'cost_total',              label: '\u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C \u0432\u0441\u0435\u0433\u043E',       isCalculated: true },
    { key: 'cost_fact',               label: '\u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C \u0444\u0430\u043A\u0442',        isCalculated: true },
    { key: 'cost_remaining',          label: '\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u0441\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u0438',     isCalculated: true },
    { key: 'machine_hours_total',     label: '\u0412\u0441\u0435\u0433\u043E \u043C\u0430\u0448\u0438\u043D\u043E\u0447\u0430\u0441\u043E\u0432',   isCalculated: true },
    { key: 'machine_hours_fact',      label: '\u041C\u0430\u0448\u0438\u043D\u043E\u0447\u0430\u0441\u044B \u0444\u0430\u043A\u0442',       isCalculated: true },
    { key: 'machine_hours_remaining', label: '\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u043C\u0430\u0448\u0438\u043D\u043E\u0447\u0430\u0441\u043E\u0432', isCalculated: true },
  ], []);

  const defaultColumns = [
    'code', 'name', 'checklist', 'unit', 'volume_plan', 'volume_fact', 'volume_remaining',
    'start_date_contract', 'end_date_contract', 'start_date_plan', 'end_date_plan',
  ];
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const s = localStorage.getItem('monthlyOrderVisibleColumns');
    if (s) {
      const parsed = JSON.parse(s);
      if (!parsed.includes('checklist')) return ['code', 'name', 'checklist', ...parsed.filter(c => c !== 'code' && c !== 'name')];
      return parsed;
    }
    return defaultColumns;
  });

  const loadHeadcount = useCallback(async () => {
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const r = await headcountAPI.getByMonth(year, month);
      const map = {};
      r.data.forEach(item => {
        if (!map[item.task_id]) map[item.task_id] = {};
        map[item.task_id][item.date] = item.headcount;
      });
      setHeadcountData(map);
    } catch (e) { console.error(e); }
  }, [selectedMonth]);

  useEffect(() => { loadHeadcount(); }, [loadHeadcount]);

  const handleHeadcountSave = useCallback(async (taskId, dateStr, count) => {
    try {
      await headcountAPI.upsert(taskId, dateStr, count);
      setHeadcountData(prev => ({
        ...prev,
        [taskId]: { ...(prev[taskId] || {}), [dateStr]: count },
      }));
    } catch (e) { console.error(e); alert('\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C'); }
  }, []);

  const handleDeleteHeadcount = useCallback(async () => {
    if (!window.confirm(`\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0432\u0441\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F \u043B\u044E\u0434\u0435\u0439 \u0437\u0430 ${selectedMonth}?`)) return;
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      await headcountAPI.deleteByMonth(year, month);
      setHeadcountData({});
    } catch (e) { console.error(e); alert('\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0443\u0434\u0430\u043B\u0438\u0442\u044C'); }
  }, [selectedMonth]);

  useEffect(() => {
    if (!showGantt) return;
    const timer = setTimeout(() => {
      const tableEl = tableScrollRef.current;
      const ganttEl = ganttBodyRef.current;
      if (!tableEl || !ganttEl) return;
      const onTable = () => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        requestAnimationFrame(() => { ganttEl.scrollTop = tableEl.scrollTop; syncingRef.current = false; });
      };
      const onGantt = () => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        requestAnimationFrame(() => { tableEl.scrollTop = ganttEl.scrollTop; syncingRef.current = false; });
      };
      tableEl.addEventListener('scroll', onTable, { passive: true });
      ganttEl.addEventListener('scroll', onGantt, { passive: true });
      return () => {
        tableEl.removeEventListener('scroll', onTable);
        ganttEl.removeEventListener('scroll', onGantt);
      };
    }, 50);
    return () => clearTimeout(timer);
  }, [showGantt, filteredTasks]);

  const handleColResizeMouseDown = useCallback((e, colKey) => {
    e.preventDefault(); e.stopPropagation();
    colResizeRef.current = {
      active: true, colKey,
      startX: e.clientX,
      startWidth: colWidths[colKey] || DEFAULT_COL_WIDTHS[colKey] || 100,
      rafId: null,
    };
    const onMove = (ev) => {
      if (!colResizeRef.current.active) return;
      if (colResizeRef.current.rafId) return;
      colResizeRef.current.rafId = requestAnimationFrame(() => {
        const w = Math.max(50, colResizeRef.current.startWidth + ev.clientX - colResizeRef.current.startX);
        setColWidths(prev => ({ ...prev, [colResizeRef.current.colKey]: w }));
        colResizeRef.current.rafId = null;
      });
    };
    const onUp = () => {
      if (colResizeRef.current.rafId) { cancelAnimationFrame(colResizeRef.current.rafId); colResizeRef.current.rafId = null; }
      colResizeRef.current.active = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setColWidths(prev => { localStorage.setItem('monthlyColWidths', JSON.stringify(prev)); return prev; });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colWidths]);

  useEffect(() => { if (onShowColumnSettings) onShowColumnSettings(() => setShowColumnSettings(true)); }, [onShowColumnSettings]);
  useEffect(() => { if (onShowFilters) onShowFilters(() => setShowFilterManager(true)); }, [onShowFilters]);
  useEffect(() => { if (onShowPrint) onShowPrint(() => setShowPrintDialog(true)); }, [onShowPrint]);

  useEffect(() => {
    loadTasks(); loadEmployees(); websocketService.connect();
    const onUpdated = (msg) => {
      if (isDraggingRef.current) return;
      setTasks(prev => prev.map(t => t.id === msg.data.id ? { ...t, ...msg.data } : t));
    };
    const onCleared = () => { setTasks([]); setFilteredTasks([]); setTimeout(loadTasks, 100); };
    websocketService.on('task_updated', onUpdated);
    websocketService.on('schedule_cleared', onCleared);
    return () => {
      websocketService.off('task_updated', onUpdated);
      websocketService.off('schedule_cleared', onCleared);
    };
  }, [selectedMonth]);

  useEffect(() => { applyFilters(); }, [tasks, filters]);

  const loadTasks = async () => {
    try {
      const r = await scheduleAPI.getTasks();
      const all = r.data;
      const [year, month] = selectedMonth.split('-').map(Number);
      const mStart = new Date(year, month - 1, 1);
      const mEnd   = new Date(year, month, 0, 23, 59, 59);
      const filtered = all.filter(task => {
        if (task.is_section) return true;
        const s = task.start_date_plan ? new Date(task.start_date_plan) : null;
        const e = task.end_date_plan   ? new Date(task.end_date_plan)   : null;
        if (task.is_custom && !s && !e) return true;
        if (!s || !e) return false;
        return s <= mEnd && e >= mStart;
      });
      const hasWork = (sectionCode) =>
        filtered.some(t => !t.is_section && String(t.code).startsWith(sectionCode + '.')) ||
        filtered.some(t => t.is_section && String(t.code).startsWith(sectionCode + '.') && hasWork(t.code));
      const visible = filtered.filter(t => !t.is_section || hasWork(t.code));
      setTasks(visible);
    } catch (e) { console.error(e); }
  };

  const loadEmployees = async () => {
    try { const r = await employeesAPI.getAll({ active_only: true }); setEmployees(r.data); }
    catch (e) { console.error(e); }
  };

  // Сохранение статуса чек-листа
  const handleStatusChange = useCallback(async (taskId, field, value) => {
    try {
      await scheduleAPI.updateTask(taskId, { [field]: value });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: value } : t));
    } catch (e) { console.error('\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u0441\u0442\u0430\u0442\u0443\u0441\u0430:', e); }
  }, []);

  const handleAddCustomRow = async () => {
    if (!isAdmin) return;
    try {
      const payload = { name: '\u041D\u043E\u0432\u0430\u044F \u0440\u0430\u0431\u043E\u0442\u0430' };
      if (selectedTaskId) payload.insert_before_task_id = selectedTaskId;
      const r = await scheduleAPI.createCustomTask(payload);
      const newTask = r.data;
      setTasks(prev => {
        if (!selectedTaskId) return [...prev, newTask];
        const idx = prev.findIndex(t => t.id === selectedTaskId);
        if (idx === -1) return [...prev, newTask];
        const next = [...prev]; next.splice(idx, 0, newTask); return next;
      });
      setSelectedTaskId(newTask.id);
      setEditingCell({ taskId: newTask.id, field: 'name' });
      setEditValue(newTask.name);
    } catch (e) { console.error(e); alert('\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0441\u0442\u0440\u043E\u043A\u0443'); }
  };

  const handleDeleteCustomRow = useCallback(async (taskId) => {
    if (!isAdmin) return;
    if (!window.confirm('\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u044D\u0442\u0443 \u0441\u0442\u0440\u043E\u043A\u0443?')) return;
    try {
      await scheduleAPI.deleteTask(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      if (selectedTaskId === taskId) setSelectedTaskId(null);
    } catch (e) { console.error(e); alert('\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u0442\u0440\u043E\u043A\u0443'); }
  }, [isAdmin, selectedTaskId]);

  const handleDeleteAllCustomRows = async () => {
    if (!isAdmin) return;
    if (!window.confirm('\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0432\u0441\u0435 \u0440\u0443\u0447\u043D\u044B\u0435 \u0441\u0442\u0440\u043E\u043A\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u0430?')) return;
    try {
      await scheduleAPI.deleteAllCustomTasks();
      setTasks(prev => prev.filter(t => !t.is_custom));
      setSelectedTaskId(null);
    } catch (e) { console.error(e); alert('\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u0442\u0440\u043E\u043A\u0438'); }
  };

  const handleDragStart = useCallback((e, task) => {
    if (!task.is_custom || !isAdmin) { e.preventDefault(); return; }
    dragTaskIdRef.current = task.id;
    e.dataTransfer.effectAllowed = 'move';
    const ghost = e.currentTarget.cloneNode(true);
    ghost.style.cssText = 'position:absolute;top:-9999px;opacity:0.6;background:#e8f0fe;';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => ghost.remove(), 0);
  }, [isAdmin]);

  const handleDragOver = useCallback((e, targetTask) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragTaskIdRef.current || dragTaskIdRef.current === targetTask.id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDragOverTaskId(targetTask.id);
    setDragOverPos(pos);
  }, []);

  const handleDragLeave = useCallback(() => { setDragOverTaskId(null); }, []);
  const handleDragEnd   = useCallback(() => { dragTaskIdRef.current = null; setDragOverTaskId(null); }, []);

  const handleDrop = useCallback(async (e, targetTask) => {
    e.preventDefault();
    const draggedId = dragTaskIdRef.current;
    setDragOverTaskId(null);
    dragTaskIdRef.current = null;
    if (!draggedId || draggedId === targetTask.id) return;
    const currentTasks = allTasksRef.current;
    const dragged = currentTasks.find(t => t.id === draggedId);
    if (!dragged) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2;
    const withoutDragged = currentTasks.filter(t => t.id !== draggedId);
    const targetIdx = withoutDragged.findIndex(t => t.id === targetTask.id);
    const insertIdx = insertBefore ? targetIdx : targetIdx + 1;
    const prev = withoutDragged[insertIdx - 1];
    const next = withoutDragged[insertIdx];
    const prevOrder = prev ? prev.sort_order : 0;
    const nextOrder = next ? next.sort_order : (prevOrder + 20);
    const newSortOrder = Math.floor((prevOrder + nextOrder) / 2);
    const updatedDragged = { ...dragged, sort_order: newSortOrder };
    withoutDragged.splice(insertIdx, 0, updatedDragged);
    setTasks(withoutDragged);
    isDraggingRef.current = true;
    try { await scheduleAPI.updateTask(draggedId, { sort_order: newSortOrder }); }
    catch (err) { console.error(err); loadTasks(); }
    finally { setTimeout(() => { isDraggingRef.current = false; }, 500); }
  }, [isAdmin]);

  const getChildTasks = useCallback((sectionCode, arr) => {
    const prefix = sectionCode + '.';
    return arr.filter(t => !t.is_section && String(t.code).startsWith(prefix));
  }, []);

  const calculateSectionSum = useCallback((section, key) => {
    let sum = 0;
    getChildTasks(section.code, filteredTasks).forEach(t => {
      switch (key) {
        case 'labor_total':             sum += (t.labor_per_unit || 0) * t.volume_plan; break;
        case 'labor_fact':              sum += (t.labor_per_unit || 0) * t.volume_fact; break;
        case 'labor_remaining':         sum += (t.labor_per_unit || 0) * (t.volume_plan - t.volume_fact); break;
        case 'cost_total':              sum += (t.unit_price || 0) * t.volume_plan; break;
        case 'cost_fact':               sum += (t.unit_price || 0) * t.volume_fact; break;
        case 'cost_remaining':          sum += (t.unit_price || 0) * (t.volume_plan - t.volume_fact); break;
        case 'machine_hours_total':     sum += (t.machine_hours_per_unit || 0) * t.volume_plan; break;
        case 'machine_hours_fact':      sum += (t.machine_hours_per_unit || 0) * t.volume_fact; break;
        case 'machine_hours_remaining': sum += (t.machine_hours_per_unit || 0) * (t.volume_plan - t.volume_fact); break;
        default: break;
      }
    });
    return sum;
  }, [filteredTasks, getChildTasks]);

  const getDisplayValue = useCallback((task, key) => {
    if (key === 'checklist') return null;
    if (task.is_section) {
      const sumCols = ['labor_total','labor_fact','labor_remaining','cost_total','cost_fact','cost_remaining','machine_hours_total','machine_hours_fact','machine_hours_remaining'];
      if (sumCols.includes(key)) return calculateSectionSum(task, key).toFixed(2);
      if (['volume_plan','volume_fact','volume_remaining','unit','unit_price','labor_per_unit','machine_hours_per_unit','executor'].includes(key)) return '-';
    }
    switch (key) {
      case 'volume_remaining':         return (task.volume_plan - task.volume_fact).toFixed(2);
      case 'labor_total':              return ((task.labor_per_unit || 0) * task.volume_plan).toFixed(2);
      case 'labor_fact':               return ((task.labor_per_unit || 0) * task.volume_fact).toFixed(2);
      case 'labor_remaining':          return ((task.labor_per_unit || 0) * (task.volume_plan - task.volume_fact)).toFixed(2);
      case 'cost_total':               return ((task.unit_price || 0) * task.volume_plan).toFixed(2);
      case 'cost_fact':                return ((task.unit_price || 0) * task.volume_fact).toFixed(2);
      case 'cost_remaining':           return ((task.unit_price || 0) * (task.volume_plan - task.volume_fact)).toFixed(2);
      case 'machine_hours_total':      return ((task.machine_hours_per_unit || 0) * task.volume_plan).toFixed(2);
      case 'machine_hours_fact':       return ((task.machine_hours_per_unit || 0) * task.volume_fact).toFixed(2);
      case 'machine_hours_remaining':  return ((task.machine_hours_per_unit || 0) * (task.volume_plan - task.volume_fact)).toFixed(2);
      case 'start_date_contract': case 'end_date_contract':
      case 'start_date_plan':     case 'end_date_plan':
        return task[key] ? new Date(task[key]).toLocaleDateString('ru-RU') : '-';
      default: return task[key] !== undefined && task[key] !== null ? String(task[key]) : '-';
    }
  }, [calculateSectionSum]);

  const applyFilters = () => {
    const activeFilters = Object.entries(filters).filter(([, v]) => v && v.trim());
    if (activeFilters.length === 0) {
      setHasActiveFilters(false);
      setFilteredTasks(tasks);
      return;
    }
    setHasActiveFilters(true);
    const matchedWorks = tasks.filter(t => {
      if (t.is_section) return false;
      return activeFilters.every(([k, v]) => String(getDisplayValue(t, k) || '').toLowerCase().includes(v.toLowerCase()));
    });
    const parentIds = new Set();
    matchedWorks.forEach(t => getParentIds(t, tasks).forEach(id => parentIds.add(id)));
    const matchedWorkIds = new Set(matchedWorks.map(t => t.id));
    setFilteredTasks(tasks.filter(t => matchedWorkIds.has(t.id) || (t.is_section && parentIds.has(t.id))));
  };

  const handleFilterApply = useCallback((k, v) => setFilters(prev => ({ ...prev, [k]: v })), []);
  const handleClearAllFilters = useCallback(() => { setFilters({}); setShowFilterManager(false); }, []);

  const getColumnValues = useCallback((key) => {
    if (key === 'checklist') return [];
    const active = Object.entries(filters).filter(([k, v]) => k !== key && v && v.trim());
    let arr = tasks.filter(t => !t.is_section);
    active.forEach(([k, v]) => { arr = arr.filter(t => String(getDisplayValue(t, k) || '').toLowerCase().includes(v.toLowerCase())); });
    return arr.map(t => getDisplayValue(t, key));
  }, [filters, tasks, getDisplayValue]);

  const handleThContextMenu = useCallback((e, colKey) => {
    e.preventDefault();
    if (colKey === 'checklist') return;
    setFilterTriggers(prev => ({ ...prev, [colKey]: { clientX: e.clientX, clientY: e.clientY, _id: Date.now() } }));
  }, []);

  const isFieldEditable = useCallback((task, key) => {
    if (key === 'checklist') return false;
    if (!isAdmin || task.is_section) return false;
    if (task.is_custom) return CUSTOM_EDITABLE.includes(key);
    return STANDARD_EDITABLE.includes(key);
  }, [isAdmin]);

  const handleCellDoubleClick = useCallback((task, key) => {
    if (key === 'checklist') return;
    if (!isFieldEditable(task, key)) return;
    setEditingCell({ taskId: task.id, field: key });
    let val = '';
    if (DATE_FIELDS.includes(key)) val = task[key] ? new Date(task[key]).toISOString().split('T')[0] : '';
    else val = task[key] !== null && task[key] !== undefined ? String(task[key]) : '';
    setEditValue(val);
  }, [isFieldEditable]);

  const handleCellBlur = useCallback(async () => {
    const ec = editingCellRef.current;
    const ev = editValueRef.current;
    if (!ec) return;
    setEditingCell(null);
    const task = allTasksRef.current.find(t => t.id === ec.taskId);
    if (!task) return;
    let cur = task[ec.field];
    if (DATE_FIELDS.includes(ec.field)) cur = cur ? new Date(cur).toISOString().split('T')[0] : '';
    else cur = cur !== null && cur !== undefined ? String(cur) : '';
    if (ev === cur) return;
    const updateVal = NUMBER_FIELDS.includes(ec.field)
      ? (ev === '' ? 0 : parseFloat(ev))
      : (ev || null);
    try {
      await scheduleAPI.updateTask(ec.taskId, { [ec.field]: updateVal });
      setTasks(prev => prev.map(t => t.id === ec.taskId ? { ...t, [ec.field]: updateVal } : t));
    } catch (e) { console.error(e); }
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleCellBlur();
    else if (e.key === 'Escape') setEditingCell(null);
  }, [handleCellBlur]);

  const getCellValue = useCallback((task, key) => {
    // Чек-лист: 4 кружка со статусами
    if (key === 'checklist') {
      if (task.is_section) return null;
      const fields = [
        { key: 'status_people',    label: '\u041B\u044E\u0434\u0438' },
        { key: 'status_equipment', label: '\u0422\u0435\u0445\u043D\u0438\u043A\u0430' },
        { key: 'status_mtr',       label: '\u041C\u0422\u0420' },
        { key: 'status_access',    label: '\u0414\u043E\u043F\u0443\u0441\u043A' },
      ];
      return (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'flex-end' }}>
          {fields.map(f => (
            <ChecklistStatus
              key={f.key}
              value={task[f.key] || 'gray'}
              label={f.label}
              size={14}
              onChange={isAdmin ? (val) => handleStatusChange(task.id, f.key, val) : undefined}
            />
          ))}
        </div>
      );
    }
    if (editingCell && editingCell.taskId === task.id && editingCell.field === key) {
      if (key === 'executor') return (
        <select value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={handleCellBlur} onKeyDown={handleKeyDown} autoFocus style={{ width: '100%', padding: '2px' }}>
          <option value="">\u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D</option>
          {employees.map(emp => <option key={emp.id} value={emp.full_name}>{emp.full_name}</option>)}
        </select>
      );
      if (NUMBER_FIELDS.includes(key)) return (
        <input type="number" step="any" value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={handleCellBlur} onKeyDown={handleKeyDown} autoFocus style={{ width: '100%', padding: '2px' }} />
      );
      if (DATE_FIELDS.includes(key)) return (
        <input type="date" value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={handleCellBlur} onKeyDown={handleKeyDown} autoFocus style={{ width: '100%', padding: '2px' }} />
      );
      return (
        <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={handleCellBlur} onKeyDown={handleKeyDown} autoFocus style={{ width: '100%', padding: '2px' }} />
      );
    }
    return getDisplayValue(task, key);
  }, [editingCell, editValue, employees, handleCellBlur, handleKeyDown, getDisplayValue, isAdmin, handleStatusChange]);

  const getColLabel = useCallback((key) => availableColumns.find(c => c.key === key)?.label ?? key, [availableColumns]);

  const handleSaveColumnSettings = useCallback((cols) => {
    setVisibleColumns(cols);
    localStorage.setItem('monthlyOrderVisibleColumns', JSON.stringify(cols));
  }, []);

  const getRowStyle = useCallback((task) => {
    const isSelected = task.id === selectedTaskId;
    const isDragOver = task.id === dragOverTaskId;
    if (task.is_section) {
      const level = getLevelFromCode(task.code);
      return {
        backgroundColor: isSelected ? '#b3d4ff' : getSectionColor(level),
        fontWeight: 'bold',
        fontSize: level === 0 ? '1.02em' : '1em',
        outline: isSelected ? '2px solid #4a90e2' : 'none',
        borderTop: isDragOver && dragOverPos === 'before' ? '3px solid #4a90e2' : undefined,
        borderBottom: isDragOver && dragOverPos === 'after' ? '3px solid #4a90e2' : undefined,
      };
    }
    return {
      backgroundColor: isSelected ? '#e8f0fe' : task.is_custom ? '#fff9e6' : 'inherit',
      outline: isSelected ? '2px solid #4a90e2' : 'none',
      borderTop: isDragOver && dragOverPos === 'before' ? '3px solid #4a90e2' : undefined,
      borderBottom: isDragOver && dragOverPos === 'after' ? '3px solid #4a90e2' : undefined,
      cursor: task.is_custom && isAdmin ? 'grab' : 'default',
    };
  }, [selectedTaskId, dragOverTaskId, dragOverPos, isAdmin]);

  const getCellStyle = useCallback((task, key) => {
    if (key === 'checklist') return { textAlign: 'center', padding: '2px 4px' };
    if (!isAdmin || task.is_section) return {};
    if (isFieldEditable(task, key))
      return { cursor: 'pointer', backgroundColor: editingCell?.taskId === task.id && editingCell?.field === key ? '#ffffcc' : 'inherit' };
    return {};
  }, [isAdmin, isFieldEditable, editingCell]);

  const handleRowClick = useCallback((task) => {
    if (editingCellRef.current) return;
    setSelectedTaskId(prev => prev === task.id ? null : task.id);
  }, []);

  const handleMouseDown = (e) => { setIsResizing(true); e.preventDefault(); };
  useEffect(() => {
    const onMove = (e) => {
      if (!isResizing || !containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      const w = ((e.clientX - r.left) / r.width) * 100;
      if (w >= 20 && w <= 85) setTableWidth(w);
    };
    const onUp = () => setIsResizing(false);
    if (isResizing) { document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); }
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [isResizing]);

  const handlePrint = useCallback((selectedCols, ganttScale) => {
    setShowPrintDialog(false);
    localStorage.setItem('ganttScale', ganttScale);

    const project = JSON.parse(localStorage.getItem('currentProject') || 'null');
    const projectName = project?.name || '\u041F\u0440\u043E\u0435\u043A\u0442';
    const monthLabel = new Date(selectedMonth + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    const ROW_H = 24;
    // И\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u043C checklist \u0438\u0437 \u043F\u0435\u0447\u0430\u0442\u0438 (\u043D\u0435 \u043F\u043E\u0434\u0434\u0430\u0435\u0442\u0441\u044F)
    const printCols = selectedCols.filter(k => k !== 'checklist');
    const colLabels = printCols.map(k => availableColumns.find(c => c.key === k)?.label ?? k);
    const headerRow = colLabels.map(l => `<th>${l}</th>`).join('');
    const bodyRows = filteredTasks.map(task => {
      const bgColor = task.is_section ? getSectionColor(getLevelFromCode(task.code)) : (task.is_custom ? '#fff9e6' : '#fff');
      const fw = task.is_section ? 'bold' : 'normal';
      const cells = printCols.map(key => `<td style="font-weight:${fw};">${getDisplayValue(task, key) || ''}</td>`).join('');
      return `<tr style="background:${bgColor};" class="data-row">${cells}</tr>`;
    }).join('');
    const tableHtml = `<table id="main-table"><thead><tr class="header-row">${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    const ganttHtml = showGantt ? buildGanttHtml(filteredTasks, ganttScale, ROW_H) : '';

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8" />
      <title>\u041C\u0421\u0413 \u2014 ${projectName} \u2014 ${monthLabel}</title>
      <style>
        @page { size: A3 landscape; margin: 8mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 9px; }
        h2 { font-size: 13px; margin-bottom: 2px; }
        p.sub { font-size: 10px; color: #555; margin-bottom: 6px; }
        .print-layout { display: flex; align-items: flex-start; gap: 4px; }
        #main-table { border-collapse: collapse; table-layout: auto; }
        #main-table th, #main-table td { border: 1px solid #bbb; padding: 0 4px; white-space: nowrap; font-size: 9px; vertical-align: middle; height: ${ROW_H}px; overflow: hidden; }
        #main-table th { background: #d0dff0 !important; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        tr[style*="#B8D4E8"] td { background: #B8D4E8 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        tr[style*="#C8DFF0"] td { background: #C8DFF0 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        tr[style*="#D8EAF5"] td { background: #D8EAF5 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        tr[style*="#E4F1F8"] td { background: #E4F1F8 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        tr[style*="#EFF6FB"] td { background: #EFF6FB !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        tr[style*="#fff9e6"] td { background: #fff9e6 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      </style>
    </head><body>
      <h2>\u041C\u0421\u0413 \u2014 ${projectName}</h2>
      <p class="sub">\u041F\u0435\u0440\u0438\u043E\u0434: ${monthLabel} &nbsp;|&nbsp; \u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u043E: ${new Date().toLocaleDateString('ru-RU')}</p>
      <div class="print-layout">
        <div>${tableHtml}</div>
        ${showGantt ? `<div>${ganttHtml}</div>` : ''}
      </div>
    </body></html>`);
    doc.close();
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 2000);
  }, [filteredTasks, selectedMonth, availableColumns, getDisplayValue, showGantt]);

  return (
    <div className="monthly-order">
      <div className="month-selector">
        <label>\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u0435\u0441\u044F\u0446:</label>
        <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
        <span style={{ fontSize: 13, color: '#666' }}>
          \u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u0440\u0430\u0431\u043E\u0442\u044B \u0441 \u043F\u043B\u0430\u043D\u043E\u0432\u044B\u043C\u0438 \u0434\u0430\u0442\u0430\u043C\u0438, \u043F\u043E\u043F\u0430\u0434\u0430\u044E\u0449\u0438\u043C\u0438 \u0432 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043C\u0435\u0441\u044F\u0446
        </span>
        <button
          onClick={handleDeleteHeadcount}
          title="\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0432\u0441\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F \u043B\u044E\u0434\u0435\u0439 \u0437\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043C\u0435\u0441\u044F\u0446"
          style={{ padding: '4px 12px', background: '#e07b00', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, marginLeft: 12 }}
        >
          \u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F
        </button>
        {isAdmin && (
          <div style={{ display: 'inline-flex', gap: 8, marginLeft: 8 }}>
            <button
              onClick={handleAddCustomRow}
              title={selectedTaskId ? '\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0441\u0442\u0440\u043E\u043A\u0443 \u0432\u044B\u0448\u0435 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u043D\u043E\u0439' : '\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0441\u0442\u0440\u043E\u043A\u0443 \u0432 \u043A\u043E\u043D\u0435\u0446'}
              style={{ padding: '4px 12px', background: '#4a90e2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
            >
              + \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0441\u0442\u0440\u043E\u043A\u0443
            </button>
            <button
              onClick={handleDeleteAllCustomRows}
              title="\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0432\u0441\u0435 \u0440\u0443\u0447\u043D\u044B\u0435 \u0441\u0442\u0440\u043E\u043A\u0438"
              style={{ padding: '4px 12px', background: '#e55', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
            >
              \u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0432\u0441\u0435 \u0440\u0443\u0447\u043D\u044B\u0435
            </button>
          </div>
        )}
      </div>

      <div className="schedule-container-integrated" ref={containerRef}
        style={{ userSelect: isResizing ? 'none' : 'auto' }}>
        <div className="schedule-split-view">
          <div className="schedule-table-section"
            style={{ width: showGantt ? `${tableWidth}%` : '100%' }}
            ref={tableScrollRef}>
            <div className="table-wrapper">
              <table className="tasks-table-integrated">
                <colgroup>
                  {isAdmin && <col style={{ width: '32px' }} />}
                  {visibleColumns.map(k => <col key={k} style={{ width: `${colWidths[k] || 100}px` }} />)}
                </colgroup>
                <thead style={{ height: `${tableHeaderHeight}px` }}>
                  <tr className="thead-labels" style={{ height: `${tableHeaderHeight}px`, verticalAlign: 'middle' }}>
                    {isAdmin && <th style={{ width: 32, padding: 0 }} title="\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" />}
                    {visibleColumns.map(key => (
                      <th key={key}
                        className={filters[key] ? 'has-filter' : ''}
                        onContextMenu={e => handleThContextMenu(e, key)}
                        title={key !== 'checklist' ? '\u041F\u0440\u0430\u0432\u044B\u0439 \u043A\u043B\u0438\u043A \u2014 \u0444\u0438\u043B\u044C\u0442\u0440' : ''}
                        style={{ verticalAlign: 'middle', textAlign: 'center' }}
                      >
                        <span className="th-label-text">{getColLabel(key)}</span>
                        {key !== 'checklist' && (
                          <ColumnFilter
                            columnKey={key}
                            allValues={getColumnValues(key)}
                            currentFilter={filters[key] || ''}
                            onApplyFilter={handleFilterApply}
                            triggerEvent={filterTriggers[key]}
                          />
                        )}
                        <div className="col-resize-handle" onMouseDown={e => handleColResizeMouseDown(e, key)} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      visibleColumns={visibleColumns}
                      isAdmin={isAdmin}
                      isEditing={editingCell?.taskId === task.id}
                      isSelected={selectedTaskId === task.id}
                      isDragOver={dragOverTaskId === task.id}
                      dragOverPos={dragOverPos}
                      getRowStyle={getRowStyle}
                      getCellStyle={getCellStyle}
                      getCellValue={getCellValue}
                      isFieldEditable={isFieldEditable}
                      onRowClick={handleRowClick}
                      onCellDoubleClick={handleCellDoubleClick}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDragEnd={handleDragEnd}
                      onDrop={handleDrop}
                      onDeleteCustomRow={handleDeleteCustomRow}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {showGantt && (
            <div className="resize-divider" onMouseDown={handleMouseDown}>
              <div className="resize-handle" />
            </div>
          )}

          {showGantt && (
            <div className="schedule-gantt-section" style={{ width: `${100 - tableWidth}%` }}>
              <GanttChart
                tasks={filteredTasks}
                externalScrollRef={ganttBodyRef}
                headcountEnabled={true}
                headcountData={headcountData}
                onHeadcountSave={handleHeadcountSave}
                onTotalsRowChange={setGanttShowsTotals}
              />
            </div>
          )}
        </div>

        {showColumnSettings && (
          <ColumnSettings availableColumns={availableColumns} visibleColumns={visibleColumns}
            onSave={handleSaveColumnSettings} onClose={() => setShowColumnSettings(false)} />
        )}
        {showFilterManager && (
          <FilterManager activeFilters={filters} onClearAll={handleClearAllFilters}
            onClose={() => setShowFilterManager(false)} />
        )}
        {showPrintDialog && (
          <PrintDialog
            availableColumns={availableColumns}
            defaultVisible={visibleColumns}
            includeGantt={showGantt}
            onPrint={handlePrint}
            onClose={() => setShowPrintDialog(false)}
          />
        )}
      </div>
    </div>
  );
}

export default MonthlyOrder;
