import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { scheduleAPI, employeesAPI } from '../services/api';
import websocketService from '../services/websocket';
import GanttChart from './GanttChart';
import ColumnSettings from './ColumnSettings';
import ColumnFilter from './ColumnFilter';
import ChecklistFilter from './ChecklistFilter';
import FilterManager from './FilterManager';
import ChecklistStatus from './ChecklistStatus';
import { useAuth } from '../contexts/AuthContext';

const SECTION_COLORS = [
  '#7B9BBF', '#9BB5CF', '#B5CADF', '#CDE0EE', '#E0EDF6',
];

function getSectionColor(level) {
  return SECTION_COLORS[Math.min(Math.max(level || 0, 0), SECTION_COLORS.length - 1)];
}
function getLevelFromCode(code) {
  if (!code) return 0;
  return String(code).split('.').length - 1;
}
function parseCode(code) {
  if (!code) return [];
  return String(code).split('.').map(s => { const n = parseInt(s, 10); return isNaN(n) ? s : n; });
}
function compareCode(a, b) {
  const pa = parseCode(a.code), pb = parseCode(b.code);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const sa = pa[i] ?? -1, sb = pb[i] ?? -1;
    if (sa < sb) return -1; if (sa > sb) return 1;
  }
  return 0;
}

// 4 отдельных колонки чек-листа (те же что в MonthlyOrder)
const CHECKLIST_FIELDS = [
  { key: 'status_people',    colKey: 'cl_people',    label: 'Люди' },
  { key: 'status_equipment', colKey: 'cl_equipment', label: 'Техника' },
  { key: 'status_mtr',       colKey: 'cl_mtr',       label: 'МТР' },
  { key: 'status_access',    colKey: 'cl_access',    label: 'Допуск' },
];
const CHECKLIST_COL_KEYS = new Set(CHECKLIST_FIELDS.map(f => f.colKey));
const CHECKLIST_COL_TO_FIELD = Object.fromEntries(CHECKLIST_FIELDS.map(f => [f.colKey, f.key]));

const DEFAULT_COL_WIDTHS = {
  code: 90, name: 280, unit: 60, volume_plan: 90, volume_fact: 90,
  volume_remaining: 90, start_date_contract: 110, end_date_contract: 110,
  start_date_plan: 110, end_date_plan: 110, unit_price: 90,
  labor_per_unit: 100, machine_hours_per_unit: 110, executor: 150,
  labor_total: 100, labor_fact: 100, labor_remaining: 110,
  cost_total: 100, cost_fact: 100, cost_remaining: 110,
  machine_hours_total: 110, machine_hours_fact: 110, machine_hours_remaining: 120,
  cl_people: 60, cl_equipment: 70, cl_mtr: 55, cl_access: 70,
};

const LEFT_ALIGN_COLS = new Set(['code', 'name']);
const COLLAPSED_STORAGE_KEY = 'scheduleCollapsedSections';

function loadCollapsedFromStorage() {
  try {
    const s = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    return s ? new Set(JSON.parse(s)) : new Set();
  } catch { return new Set(); }
}
function saveCollapsedToStorage(set) {
  try { localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
}

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

function taskInMonth(task, yearMonth) {
  if (!yearMonth) return true;
  const [year, month] = yearMonth.split('-').map(Number);
  const mStart = new Date(year, month - 1, 1);
  const mEnd   = new Date(year, month, 0, 23, 59, 59, 999);
  const s = task.start_date_plan ? new Date(task.start_date_plan) : null;
  const e = task.end_date_plan   ? new Date(task.end_date_plan)   : null;
  if (!s || !e) return false;
  return s <= mEnd && e >= mStart;
}
function taskIsOverdue(task) {
  if (!task.end_date_plan) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(task.end_date_plan); end.setHours(0, 0, 0, 0);
  return end < today && (task.volume_plan - task.volume_fact) > 0;
}
function taskIsDone(task) {
  return (task.volume_plan - task.volume_fact) <= 0;
}
function getDescendantIds(sectionId, allTasks) {
  const section = allTasks.find(t => t.id === sectionId);
  if (!section) return new Set();
  const prefix = section.code + '.';
  const ids = new Set();
  allTasks.forEach(t => { if (t.id !== sectionId && String(t.code).startsWith(prefix)) ids.add(t.id); });
  return ids;
}

function Schedule({ showGantt, onShowColumnSettings, onShowFilters }) {
  const { user } = useAuth();
  const isAdmin = useMemo(() => user?.role === 'admin', [user]);

  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const [filters, setFilters] = useState({});

  const [monthPreset,      setMonthPreset]      = useState(null);
  const [overduePreset,    setOverduePreset]    = useState(null);
  const [completionPreset, setCompletionPreset] = useState(null);
  const [executorPreset,   setExecutorPreset]   = useState(null);

  const [collapsedSections, setCollapsedSections] = useState(() => loadCollapsedFromStorage());
  const [tableWidth,         setTableWidth]         = useState(60);
  const [isResizing,         setIsResizing]         = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showFilterManager,  setShowFilterManager]  = useState(false);
  const [editingCell,        setEditingCell]        = useState(null);
  const [editValue,          setEditValue]          = useState('');
  const [employees,          setEmployees]          = useState([]);
  const [filterTriggers,     setFilterTriggers]     = useState({});

  const [colWidths, setColWidths] = useState(() => {
    try {
      const s = localStorage.getItem('scheduleColWidths');
      return s ? { ...DEFAULT_COL_WIDTHS, ...JSON.parse(s) } : { ...DEFAULT_COL_WIDTHS };
    } catch { return { ...DEFAULT_COL_WIDTHS }; }
  });

  const allTasksRef    = useRef([]);
  const containerRef   = useRef(null);
  const tableScrollRef = useRef(null);
  const ganttBodyRef   = useRef(null);
  const syncingRef     = useRef(false);
  const colResizeRef   = useRef({ active: false, colKey: null, startX: 0, startWidth: 0 });

  useEffect(() => { allTasksRef.current = tasks; }, [tasks]);

  const availableColumns = [
    { key: 'code',                    label: 'Шифр' },
    { key: 'name',                    label: 'Наименование' },
    { key: 'cl_people',               label: 'Люди',      isCalculated: true },
    { key: 'cl_equipment',            label: 'Техника',  isCalculated: true },
    { key: 'cl_mtr',                  label: 'МТР',        isCalculated: true },
    { key: 'cl_access',               label: 'Допуск',    isCalculated: true },
    { key: 'unit',                    label: 'Ед. изм.' },
    { key: 'volume_plan',             label: 'Объём план' },
    { key: 'volume_fact',             label: 'Объём факт' },
    { key: 'volume_remaining',        label: 'Объём остаток',  isCalculated: true },
    { key: 'start_date_contract',     label: 'Старт контракт' },
    { key: 'end_date_contract',       label: 'Финиш контракт' },
    { key: 'start_date_plan',         label: 'Старт план',    editable: true },
    { key: 'end_date_plan',           label: 'Финиш план',    editable: true },
    { key: 'unit_price',              label: 'Цена за ед.' },
    { key: 'labor_per_unit',          label: 'Трудозатраты/ед.' },
    { key: 'machine_hours_per_unit',  label: 'Машиночасы/ед.' },
    { key: 'executor',                label: 'Исполнитель',           editable: true },
    { key: 'labor_total',             label: 'Всего трудозатрат',   isCalculated: true },
    { key: 'labor_fact',              label: 'Трудозатраты факт',   isCalculated: true },
    { key: 'labor_remaining',         label: 'Остаток трудозатрат', isCalculated: true },
    { key: 'cost_total',              label: 'Стоимость всего',       isCalculated: true },
    { key: 'cost_fact',               label: 'Стоимость факт',        isCalculated: true },
    { key: 'cost_remaining',          label: 'Остаток стоимости',     isCalculated: true },
    { key: 'machine_hours_total',     label: 'Всего машиночасов',   isCalculated: true },
    { key: 'machine_hours_fact',      label: 'Машиночасы факт',       isCalculated: true },
    { key: 'machine_hours_remaining', label: 'Остаток машиночасов', isCalculated: true },
  ];

  const defaultColumns = [
    'code', 'name', 'cl_people', 'cl_equipment', 'cl_mtr', 'cl_access',
    'unit', 'volume_plan', 'volume_fact', 'volume_remaining',
    'start_date_contract', 'end_date_contract',
  ];

  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const s = localStorage.getItem('scheduleVisibleColumns');
      if (s) {
        const parsed = JSON.parse(s);
        // Миграция: заменяем старый 'checklist' на 4 отдельных
        if (parsed.includes('checklist')) {
          const idx = parsed.indexOf('checklist');
          const migrated = [...parsed];
          migrated.splice(idx, 1, 'cl_people', 'cl_equipment', 'cl_mtr', 'cl_access');
          return migrated;
        }
        return parsed;
      }
    } catch { /* ignore */ }
    return defaultColumns;
  });

  useEffect(() => {
    if (!showGantt) return;
    const timer = setTimeout(() => {
      const tableEl = tableScrollRef.current;
      const ganttEl = ganttBodyRef.current;
      if (!tableEl || !ganttEl) return;
      const onTableScroll = () => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        ganttEl.scrollTop = tableEl.scrollTop;
        requestAnimationFrame(() => { syncingRef.current = false; });
      };
      const onGanttScroll = () => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        tableEl.scrollTop = ganttEl.scrollTop;
        requestAnimationFrame(() => { syncingRef.current = false; });
      };
      tableEl.addEventListener('scroll', onTableScroll, { passive: true });
      ganttEl.addEventListener('scroll', onGanttScroll, { passive: true });
      return () => {
        tableEl.removeEventListener('scroll', onTableScroll);
        ganttEl.removeEventListener('scroll', onGanttScroll);
      };
    }, 50);
    return () => clearTimeout(timer);
  }, [showGantt, filteredTasks]);

  const handleColResizeMouseDown = useCallback((e, colKey) => {
    e.preventDefault(); e.stopPropagation();
    colResizeRef.current = { active: true, colKey, startX: e.clientX, startWidth: colWidths[colKey] || DEFAULT_COL_WIDTHS[colKey] || 100 };
    const onMove = (ev) => {
      if (!colResizeRef.current.active) return;
      const w = Math.max(40, colResizeRef.current.startWidth + ev.clientX - colResizeRef.current.startX);
      setColWidths(prev => ({ ...prev, [colResizeRef.current.colKey]: w }));
    };
    const onUp = () => {
      colResizeRef.current.active = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setColWidths(prev => { localStorage.setItem('scheduleColWidths', JSON.stringify(prev)); return prev; });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colWidths]);

  useEffect(() => { if (onShowColumnSettings) onShowColumnSettings(() => setShowColumnSettings(true)); }, [onShowColumnSettings]);
  useEffect(() => { if (onShowFilters) onShowFilters(() => setShowFilterManager(true)); }, [onShowFilters]);

  useEffect(() => {
    loadTasks(); loadEmployees(); websocketService.connect();
    const onCreated  = (msg) => { if (!msg.data.is_custom) setTasks(prev => [...prev, msg.data].sort(compareCode)); };
    const onUpdated  = (msg) => setTasks(prev => prev.map(t => t.id === msg.data.id ? { ...t, ...msg.data } : t));
    const onDeleted  = (msg) => setTasks(prev => prev.filter(t => t.id !== msg.data.id));
    const onCleared  = ()   => { setTasks([]); setFilteredTasks([]); setTimeout(loadTasks, 100); };
    websocketService.on('task_created', onCreated);
    websocketService.on('task_updated', onUpdated);
    websocketService.on('task_deleted', onDeleted);
    websocketService.on('schedule_cleared', onCleared);
    return () => {
      websocketService.off('task_created', onCreated);
      websocketService.off('task_updated', onUpdated);
      websocketService.off('task_deleted', onDeleted);
      websocketService.off('schedule_cleared', onCleared);
    };
  }, []);

  useEffect(() => { applyFilters(); }, [tasks, filters, monthPreset, overduePreset, completionPreset, executorPreset]);

  const loadTasks = async () => {
    try {
      const r = await scheduleAPI.getTasks();
      setTasks([...r.data.filter(t => !t.is_custom)].sort(compareCode));
    } catch (e) { console.error('Ошибка загрузки задач:', e); }
  };
  const loadEmployees = async () => {
    try { const r = await employeesAPI.getAll({ active_only: true }); setEmployees(r.data); }
    catch (e) { console.error('Ошибка загрузки сотрудников:', e); }
  };

  const handleStatusChange = useCallback(async (taskId, field, value) => {
    try {
      await scheduleAPI.updateTask(taskId, { [field]: value });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: value } : t));
    } catch (e) { console.error('Ошибка сохранения статуса:', e); }
  }, []);

  const getChildTasks = (sectionCode, arr) => {
    const prefix = sectionCode + '.';
    return arr.filter(t => !t.is_section && String(t.code).startsWith(prefix));
  };

  const calculateSectionSum = (section, key) => {
    let sum = 0;
    getChildTasks(section.code, filteredTasks).forEach(t => {
      switch (key) {
        case 'labor_total':             sum += (t.labor_per_unit||0)*t.volume_plan; break;
        case 'labor_fact':              sum += (t.labor_per_unit||0)*t.volume_fact; break;
        case 'labor_remaining':         sum += (t.labor_per_unit||0)*(t.volume_plan-t.volume_fact); break;
        case 'cost_total':              sum += (t.unit_price||0)*t.volume_plan; break;
        case 'cost_fact':               sum += (t.unit_price||0)*t.volume_fact; break;
        case 'cost_remaining':          sum += (t.unit_price||0)*(t.volume_plan-t.volume_fact); break;
        case 'machine_hours_total':     sum += (t.machine_hours_per_unit||0)*t.volume_plan; break;
        case 'machine_hours_fact':      sum += (t.machine_hours_per_unit||0)*t.volume_fact; break;
        case 'machine_hours_remaining': sum += (t.machine_hours_per_unit||0)*(t.volume_plan-t.volume_fact); break;
        default: break;
      }
    });
    return sum;
  };

  const getDisplayValue = (task, key) => {
    if (CHECKLIST_COL_KEYS.has(key)) return null;
    if (task.is_section) {
      const sumCols = ['labor_total','labor_fact','labor_remaining','cost_total','cost_fact','cost_remaining','machine_hours_total','machine_hours_fact','machine_hours_remaining'];
      if (sumCols.includes(key)) return calculateSectionSum(task, key).toFixed(2);
      if (['volume_plan','volume_fact','volume_remaining','unit','unit_price','labor_per_unit','machine_hours_per_unit','executor'].includes(key)) return '-';
    }
    switch (key) {
      case 'volume_remaining':         return (task.volume_plan-task.volume_fact).toFixed(2);
      case 'labor_total':              return ((task.labor_per_unit||0)*task.volume_plan).toFixed(2);
      case 'labor_fact':               return ((task.labor_per_unit||0)*task.volume_fact).toFixed(2);
      case 'labor_remaining':          return ((task.labor_per_unit||0)*(task.volume_plan-task.volume_fact)).toFixed(2);
      case 'cost_total':               return ((task.unit_price||0)*task.volume_plan).toFixed(2);
      case 'cost_fact':                return ((task.unit_price||0)*task.volume_fact).toFixed(2);
      case 'cost_remaining':           return ((task.unit_price||0)*(task.volume_plan-task.volume_fact)).toFixed(2);
      case 'machine_hours_total':      return ((task.machine_hours_per_unit||0)*task.volume_plan).toFixed(2);
      case 'machine_hours_fact':       return ((task.machine_hours_per_unit||0)*task.volume_fact).toFixed(2);
      case 'machine_hours_remaining':  return ((task.machine_hours_per_unit||0)*(task.volume_plan-task.volume_fact)).toFixed(2);
      case 'start_date_contract': case 'end_date_contract':
      case 'start_date_plan':     case 'end_date_plan':
        return task[key] ? new Date(task[key]).toLocaleDateString('ru-RU') : '-';
      default: return task[key] !== undefined && task[key] !== null ? String(task[key]) : '-';
    }
  };

  const applyFilters = () => {
    const activeFilters = Object.entries(filters).filter(([, v]) => v && v.trim());
    const hasAnyPreset = monthPreset || overduePreset || completionPreset || executorPreset;
    if (activeFilters.length === 0 && !hasAnyPreset) {
      setHasActiveFilters(false);
      setFilteredTasks(tasks);
      return;
    }
    setHasActiveFilters(true);
    const matchedWorks = tasks.filter(t => {
      if (t.is_section) return false;
      // Обычные колонки — текстовая фильтрация; чек-лист — сравнение по значению
      if (!activeFilters.every(([k, v]) => {
        if (CHECKLIST_COL_KEYS.has(k)) return (t[CHECKLIST_COL_TO_FIELD[k]] || 'gray') === v;
        return String(getDisplayValue(t, k) || '').toLowerCase().includes(v.toLowerCase());
      })) return false;
      if (monthPreset      && !taskInMonth(t, monthPreset))                              return false;
      if (overduePreset    && !taskIsOverdue(t))                                         return false;
      if (completionPreset === 'done'   && !taskIsDone(t))                               return false;
      if (completionPreset === 'undone' &&  taskIsDone(t))                               return false;
      if (executorPreset   && !(t.executor || '').toLowerCase().includes(executorPreset.toLowerCase())) return false;
      return true;
    });
    const parentIds = new Set();
    matchedWorks.forEach(t => getParentIds(t, tasks).forEach(id => parentIds.add(id)));
    const matchedWorkIds = new Set(matchedWorks.map(t => t.id));
    setFilteredTasks(tasks.filter(t => matchedWorkIds.has(t.id) || (t.is_section && parentIds.has(t.id))));
  };

  const toggleSection = useCallback((sectionId) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId); else next.add(sectionId);
      saveCollapsedToStorage(next);
      return next;
    });
  }, []);

  const visibleTasks = useMemo(() => {
    if (collapsedSections.size === 0) return filteredTasks;
    const hiddenIds = new Set();
    collapsedSections.forEach(secId => getDescendantIds(secId, filteredTasks).forEach(id => hiddenIds.add(id)));
    return filteredTasks.filter(t => !hiddenIds.has(t.id));
  }, [filteredTasks, collapsedSections]);

  const sectionHasChildren = useCallback((section) => {
    const prefix = section.code + '.';
    return filteredTasks.some(t => t.id !== section.id && String(t.code).startsWith(prefix));
  }, [filteredTasks]);

  const handleFilterApply = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));
  const handleClearAllFilters = () => {
    setFilters({});
    setMonthPreset(null); setOverduePreset(null); setCompletionPreset(null); setExecutorPreset(null);
    setShowFilterManager(false);
  };

  const getColumnValues = (key) => {
    if (CHECKLIST_COL_KEYS.has(key)) return [];
    const active = Object.entries(filters).filter(([k, v]) => k !== key && v && v.trim());
    let arr = tasks.filter(t => !t.is_section);
    active.forEach(([k, v]) => { arr = arr.filter(t => String(getDisplayValue(t, k) || '').toLowerCase().includes(v.toLowerCase())); });
    return arr.map(t => getDisplayValue(t, key));
  };

  const handleThContextMenu = useCallback((e, colKey) => {
    e.preventDefault();
    setFilterTriggers(prev => ({ ...prev, [colKey]: { clientX: e.clientX, clientY: e.clientY, _id: Date.now() } }));
  }, []);

  const handleCellDoubleClick = (task, key) => {
    if (CHECKLIST_COL_KEYS.has(key)) return;
    if (!isAdmin || task.is_section) return;
    if (!['start_date_plan','end_date_plan','executor'].includes(key)) return;
    setEditingCell({ taskId: task.id, field: key });
    setEditValue(key === 'executor' ? (task[key] || '') : (task[key] ? new Date(task[key]).toISOString().split('T')[0] : ''));
  };

  const handleCellBlur = async () => {
    if (!editingCell) return;
    const task = tasks.find(t => t.id === editingCell.taskId);
    if (!task) return;
    let cur = task[editingCell.field];
    if (['start_date_plan','end_date_plan'].includes(editingCell.field))
      cur = cur ? new Date(cur).toISOString().split('T')[0] : '';
    else cur = cur || '';
    if (editValue === cur) { setEditingCell(null); return; }
    try {
      await scheduleAPI.updateTask(editingCell.taskId, { [editingCell.field]: editValue || null });
      setTasks(prev => prev.map(t => t.id === editingCell.taskId ? { ...t, [editingCell.field]: editValue || null } : t));
    } catch (e) { console.error('Ошибка обновления:', e); }
    finally { setEditingCell(null); }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleCellBlur();
    else if (e.key === 'Escape') setEditingCell(null);
  };

  const getCellValue = (task, key) => {
    const clField = CHECKLIST_FIELDS.find(f => f.colKey === key);
    if (clField) {
      if (task.is_section) return null;
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <ChecklistStatus
            value={task[clField.key] || 'gray'}
            size={16}
            onChange={isAdmin ? (val) => handleStatusChange(task.id, clField.key, val) : undefined}
          />
        </div>
      );
    }
    if (editingCell && editingCell.taskId === task.id && editingCell.field === key) {
      if (key === 'executor') return (
        <select value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={handleCellBlur} onKeyDown={handleKeyDown} autoFocus style={{ width:'100%', padding:'2px' }}>
          <option value="">Не выбран</option>
          {employees.map(emp => <option key={emp.id} value={emp.full_name}>{emp.full_name}</option>)}
        </select>
      );
      return <input type="date" value={editValue} onChange={e => setEditValue(e.target.value)}
        onBlur={handleCellBlur} onKeyDown={handleKeyDown} autoFocus style={{ width:'100%', padding:'2px' }} />;
    }
    return getDisplayValue(task, key);
  };

  const getColLabel = (key) => availableColumns.find(c => c.key === key)?.label ?? key;

  const handleSaveColumnSettings = (cols) => {
    setVisibleColumns(cols);
    localStorage.setItem('scheduleVisibleColumns', JSON.stringify(cols));
  };

  const getRowStyle = (task) => {
    if (task.is_section) {
      const level = getLevelFromCode(task.code);
      return { backgroundColor: getSectionColor(level), fontWeight: 'bold', fontSize: level === 0 ? '1.02em' : '1em' };
    }
    if (taskIsOverdue(task)) return { backgroundColor: '#fff0f0' };
    return {};
  };

  const getCellStyle = (task, key) => {
    if (CHECKLIST_COL_KEYS.has(key)) return { textAlign: 'center', padding: '2px 4px' };
    const base = LEFT_ALIGN_COLS.has(key) ? { textAlign: 'left' } : { textAlign: 'center' };
    if (!isAdmin || task.is_section) return base;
    if (['start_date_plan','end_date_plan','executor'].includes(key))
      return { ...base, cursor: 'pointer', backgroundColor: editingCell?.taskId === task.id && editingCell?.field === key ? '#ffffcc' : 'inherit' };
    return base;
  };

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

  const activePresetLabels = [
    monthPreset      && `📅 ${monthPreset}`,
    overduePreset    && '⚠️ Просрочки',
    completionPreset === 'done'   && '✅ Выполнено',
    completionPreset === 'undone' && '⏳ Не выполнено',
    executorPreset   && `👤 ${executorPreset}`,
  ].filter(Boolean);

  return (
    <div className="schedule-container-integrated" ref={containerRef}
      style={{ userSelect: isResizing ? 'none' : 'auto' }}>

      {activePresetLabels.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '4px 12px', background: '#e8f0fe',
          borderBottom: '1px solid #c5d4f0', fontSize: 13, color: '#1a5fa8',
        }}>
          <span>Активны пресеты:</span>
          {activePresetLabels.map((label, i) => (
            <span key={i} style={{ background: '#c5d4f0', borderRadius: 4, padding: '1px 8px' }}>{label}</span>
          ))}
          <button
            onClick={handleClearAllFilters}
            style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#e55', fontSize: 14 }}
            title="Сбросить все пресеты"
          >× сбросить</button>
        </div>
      )}

      <div className="schedule-split-view">
        <div className="schedule-table-section"
          style={{ width: showGantt ? `${tableWidth}%` : '100%' }}
          ref={tableScrollRef}>
          <div className="table-wrapper">
            <table className="tasks-table-integrated">
              <colgroup>
                {visibleColumns.map(k => <col key={k} style={{ width: `${colWidths[k] || 60}px` }} />)}
              </colgroup>
              <thead>
                <tr className="thead-labels">
                  {visibleColumns.map(key => {
                    const isClCol = CHECKLIST_COL_KEYS.has(key);
                    return (
                      <th key={key}
                        className={filters[key] ? 'has-filter' : ''}
                        onContextMenu={e => handleThContextMenu(e, key)}
                        title="Правый клик — фильтр"
                        style={{ textAlign: LEFT_ALIGN_COLS.has(key) ? 'left' : 'center' }}
                      >
                        <span className="th-label-text">{getColLabel(key)}</span>
                        {isClCol ? (
                          <ChecklistFilter
                            columnKey={key}
                            currentFilter={filters[key] || ''}
                            onApplyFilter={handleFilterApply}
                            triggerEvent={filterTriggers[key]}
                          />
                        ) : (
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
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleTasks.map(task => (
                  <tr key={task.id} style={getRowStyle(task)}>
                    {visibleColumns.map(key => {
                      if (key === 'name' && task.is_section) {
                        const hasChildren = sectionHasChildren(task);
                        const isCollapsed = collapsedSections.has(task.id);
                        const nameText = getDisplayValue(task, key);
                        return (
                          <td key={key} style={getCellStyle(task, key)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {hasChildren && (
                                <button
                                  onClick={() => toggleSection(task.id)}
                                  title={isCollapsed ? 'Развернуть' : 'Свернуть'}
                                  style={{
                                    flexShrink: 0, width: 18, height: 18, padding: 0,
                                    background: 'rgba(255,255,255,0.5)',
                                    border: '1px solid rgba(0,0,80,0.25)',
                                    borderRadius: 3, cursor: 'pointer', fontSize: 11,
                                    lineHeight: '16px', textAlign: 'center',
                                    color: '#1a3a5c', fontWeight: 'bold',
                                  }}
                                >{isCollapsed ? '+' : '−'}</button>
                              )}
                              <span style={{
                                overflow: 'hidden', textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap', display: 'block', flex: 1,
                                paddingLeft: hasChildren ? 0 : 22,
                              }} title={nameText}>{nameText}</span>
                            </div>
                          </td>
                        );
                      }
                      if (key === 'name' && !task.is_section) {
                        const nameText = getDisplayValue(task, key);
                        return (
                          <td key={key} style={getCellStyle(task, key)}
                            onDoubleClick={() => handleCellDoubleClick(task, key)}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                              title={nameText}>{nameText}</span>
                          </td>
                        );
                      }
                      return (
                        <td key={key} style={getCellStyle(task, key)}
                          onDoubleClick={() => handleCellDoubleClick(task, key)}
                          title={isAdmin && !task.is_section && ['start_date_plan','end_date_plan','executor'].includes(key) ? 'Двойной клик для редактирования' : ''}>
                          {getCellValue(task, key)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showGantt && <div className="resize-divider" onMouseDown={handleMouseDown}><div className="resize-handle" /></div>}

        {showGantt && (
          <div className="schedule-gantt-section" style={{ width: `${100 - tableWidth}%` }}>
            <GanttChart tasks={visibleTasks} externalScrollRef={ganttBodyRef} headcountEnabled={false} />
          </div>
        )}
      </div>

      {showColumnSettings && (
        <ColumnSettings availableColumns={availableColumns} visibleColumns={visibleColumns}
          onSave={handleSaveColumnSettings} onClose={() => setShowColumnSettings(false)} />
      )}
      {showFilterManager && (
        <FilterManager
          activeFilters={filters}
          onClearAll={handleClearAllFilters}
          onClose={() => setShowFilterManager(false)}
          monthPreset={monthPreset}
          onMonthPresetChange={setMonthPreset}
          overduePreset={overduePreset}
          onOverduePresetChange={setOverduePreset}
          completionPreset={completionPreset}
          onCompletionPresetChange={setCompletionPreset}
          executorPreset={executorPreset}
          onExecutorPresetChange={setExecutorPreset}
          employees={employees}
        />
      )}
    </div>
  );
}

export default Schedule;
