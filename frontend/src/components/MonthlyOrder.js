import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { scheduleAPI, employeesAPI, headcountAPI } from '../services/api';
import websocketService from '../services/websocket';
import GanttChart from './GanttChart';
import ColumnSettings from './ColumnSettings';
import ColumnFilter from './ColumnFilter';
import FilterManager from './FilterManager';
import PrintDialog from './PrintDialog';
import { useAuth } from '../contexts/AuthContext';

const SECTION_COLORS = [
  '#B8D4E8', '#C8DFF0', '#D8EAF5', '#E4F1F8', '#EFF6FB',
];
function getSectionColor(level) {
  return SECTION_COLORS[Math.min(Math.max(level || 0, 0), SECTION_COLORS.length - 1)];
}

const DEFAULT_COL_WIDTHS = {
  code: 90, name: 280, unit: 60, volume_plan: 90, volume_fact: 90,
  volume_remaining: 90, start_date_contract: 110, end_date_contract: 110,
  start_date_plan: 110, end_date_plan: 110, unit_price: 90,
  labor_per_unit: 100, machine_hours_per_unit: 110, executor: 150,
  labor_total: 100, labor_fact: 100, labor_remaining: 110,
  cost_total: 100, cost_fact: 100, cost_remaining: 110,
  machine_hours_total: 110, machine_hours_fact: 110, machine_hours_remaining: 120,
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
              title="Удалить строку"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e55', fontSize: 14, lineHeight: 1, padding: 2 }}
            >✕</button>
          )}
        </td>
      )}
      {visibleColumns.map(key => (
        <td key={key}
          style={getCellStyle(task, key)}
          onDoubleClick={() => onCellDoubleClick(task, key)}
          title={isFieldEditable(task, key) ? 'Двойной клик для редактирования' : ''}
        >
          {getCellValue(task, key)}
        </td>
      ))}
    </tr>
  );
}, (prev, next) => (
  prev.task === next.task &&
  prev.isEditing === next.isEditing &&
  prev.isSelected === next.isSelected &&
  prev.isDragOver === next.isDragOver &&
  prev.dragOverPos === next.dragOverPos &&
  prev.visibleColumns === next.visibleColumns &&
  prev.isAdmin === next.isAdmin
));

function MonthlyOrder({ showGantt, onShowColumnSettings, onShowFilters, onShowPrint }) {
  const { user } = useAuth();
  const isAdmin = useMemo(() => user?.role === 'admin', [user]);

  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const [filters, setFilters] = useState({});
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
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

  // ref для области печати
  const printAreaRef = useRef(null);

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

  const availableColumns = useMemo(() => [
    { key: 'code',                    label: 'Шифр' },
    { key: 'name',                    label: 'Наименование' },
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
  ], []);

  const defaultColumns = [
    'code', 'name', 'unit', 'volume_plan', 'volume_fact', 'volume_remaining',
    'start_date_contract', 'end_date_contract', 'start_date_plan', 'end_date_plan',
  ];
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const s = localStorage.getItem('monthlyOrderVisibleColumns');
    return s ? JSON.parse(s) : defaultColumns;
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
    } catch (e) { console.error('Ошибка загрузки headcount:', e); }
  }, [selectedMonth]);

  useEffect(() => { loadHeadcount(); }, [loadHeadcount]);

  const handleHeadcountSave = useCallback(async (taskId, dateStr, count) => {
    try {
      await headcountAPI.upsert(taskId, dateStr, count);
      setHeadcountData(prev => ({
        ...prev,
        [taskId]: { ...(prev[taskId] || {}), [dateStr]: count },
      }));
    } catch (e) { console.error('Ошибка сохранения headcount:', e); alert('Не удалось сохранить'); }
  }, []);

  const handleDeleteHeadcount = useCallback(async () => {
    if (!window.confirm(`Удалить все назначения людей за ${selectedMonth}?`)) return;
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      await headcountAPI.deleteByMonth(year, month);
      setHeadcountData({});
    } catch (e) { console.error(e); alert('Не удалось удалить'); }
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
        requestAnimationFrame(() => {
          ganttEl.scrollTop = tableEl.scrollTop;
          syncingRef.current = false;
        });
      };
      const onGantt = () => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        requestAnimationFrame(() => {
          tableEl.scrollTop = ganttEl.scrollTop;
          syncingRef.current = false;
        });
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
      if (colResizeRef.current.rafId) {
        cancelAnimationFrame(colResizeRef.current.rafId);
        colResizeRef.current.rafId = null;
      }
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
    } catch (e) { console.error('Ошибка загрузки:', e); }
  };

  const loadEmployees = async () => {
    try { const r = await employeesAPI.getAll({ active_only: true }); setEmployees(r.data); }
    catch (e) { console.error(e); }
  };

  const handleAddCustomRow = async () => {
    if (!isAdmin) return;
    try {
      const payload = { name: 'Новая работа' };
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
    } catch (e) { console.error(e); alert('Не удалось создать строку'); }
  };

  const handleDeleteCustomRow = useCallback(async (taskId) => {
    if (!isAdmin) return;
    if (!window.confirm('Удалить эту строку?')) return;
    try {
      await scheduleAPI.deleteTask(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      if (selectedTaskId === taskId) setSelectedTaskId(null);
    } catch (e) { console.error(e); alert('Не удалось удалить строку'); }
  }, [isAdmin, selectedTaskId]);

  const handleDeleteAllCustomRows = async () => {
    if (!isAdmin) return;
    if (!window.confirm('Удалить все ручные строки проекта?')) return;
    try {
      await scheduleAPI.deleteAllCustomTasks();
      setTasks(prev => prev.filter(t => !t.is_custom));
      setSelectedTaskId(null);
    } catch (e) { console.error(e); alert('Не удалось удалить строки'); }
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
    try {
      await scheduleAPI.updateTask(draggedId, { sort_order: newSortOrder });
    } catch (err) {
      console.error('Ошибка перемещения:', err);
      loadTasks();
    } finally {
      setTimeout(() => { isDraggingRef.current = false; }, 500);
    }
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
      return activeFilters.every(([k, v]) => getDisplayValue(t, k).toLowerCase().includes(v.toLowerCase()));
    });
    const parentIds = new Set();
    matchedWorks.forEach(t => getParentIds(t, tasks).forEach(id => parentIds.add(id)));
    const matchedWorkIds = new Set(matchedWorks.map(t => t.id));
    setFilteredTasks(tasks.filter(t => matchedWorkIds.has(t.id) || (t.is_section && parentIds.has(t.id))));
  };

  const handleFilterApply = useCallback((k, v) => setFilters(prev => ({ ...prev, [k]: v })), []);
  const handleClearAllFilters = useCallback(() => { setFilters({}); setShowFilterManager(false); }, []);

  const getColumnValues = useCallback((key) => {
    const active = Object.entries(filters).filter(([k, v]) => k !== key && v && v.trim());
    let arr = tasks.filter(t => !t.is_section);
    active.forEach(([k, v]) => {
      arr = arr.filter(t => getDisplayValue(t, k).toLowerCase().includes(v.toLowerCase()));
    });
    return arr.map(t => getDisplayValue(t, key));
  }, [filters, tasks, getDisplayValue]);

  const handleThContextMenu = useCallback((e, colKey) => {
    e.preventDefault();
    setFilterTriggers(prev => ({ ...prev, [colKey]: { clientX: e.clientX, clientY: e.clientY, _id: Date.now() } }));
  }, []);

  const isFieldEditable = useCallback((task, key) => {
    if (!isAdmin || task.is_section) return false;
    if (task.is_custom) return CUSTOM_EDITABLE.includes(key);
    return STANDARD_EDITABLE.includes(key);
  }, [isAdmin]);

  const handleCellDoubleClick = useCallback((task, key) => {
    if (!isFieldEditable(task, key)) return;
    setEditingCell({ taskId: task.id, field: key });
    let val = '';
    if (DATE_FIELDS.includes(key)) {
      val = task[key] ? new Date(task[key]).toISOString().split('T')[0] : '';
    } else {
      val = task[key] !== null && task[key] !== undefined ? String(task[key]) : '';
    }
    setEditValue(val);
  }, [isFieldEditable]);

  const handleCellBlur = useCallback(async () => {
    if (!editingCell) return;
    const task = tasks.find(t => t.id === editingCell.taskId);
    if (!task) return;
    let cur = task[editingCell.field];
    if (DATE_FIELDS.includes(editingCell.field)) cur = cur ? new Date(cur).toISOString().split('T')[0] : '';
    else cur = cur !== null && cur !== undefined ? String(cur) : '';
    if (editValue === cur) { setEditingCell(null); return; }
    const updateVal = NUMBER_FIELDS.includes(editingCell.field)
      ? (editValue === '' ? 0 : parseFloat(editValue))
      : (editValue || null);
    try {
      await scheduleAPI.updateTask(editingCell.taskId, { [editingCell.field]: updateVal });
      setTasks(prev => prev.map(t => t.id === editingCell.taskId ? { ...t, [editingCell.field]: updateVal } : t));
    } catch (e) { console.error(e); } finally { setEditingCell(null); }
  }, [editingCell, editValue, tasks]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleCellBlur();
    else if (e.key === 'Escape') setEditingCell(null);
  }, [handleCellBlur]);

  const getCellValue = useCallback((task, key) => {
    if (editingCell && editingCell.taskId === task.id && editingCell.field === key) {
      if (key === 'executor') return (
        <select value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={handleCellBlur} onKeyDown={handleKeyDown} autoFocus style={{ width:'100%', padding:'2px' }}>
          <option value="">Не выбран</option>
          {employees.map(emp => <option key={emp.id} value={emp.full_name}>{emp.full_name}</option>)}
        </select>
      );
      if (NUMBER_FIELDS.includes(key)) return (
        <input type="number" step="any" value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={handleCellBlur} onKeyDown={handleKeyDown} autoFocus style={{ width:'100%', padding:'2px' }} />
      );
      if (DATE_FIELDS.includes(key)) return (
        <input type="date" value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={handleCellBlur} onKeyDown={handleKeyDown} autoFocus style={{ width:'100%', padding:'2px' }} />
      );
      return (
        <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={handleCellBlur} onKeyDown={handleKeyDown} autoFocus style={{ width:'100%', padding:'2px' }} />
      );
    }
    return getDisplayValue(task, key);
  }, [editingCell, editValue, employees, handleCellBlur, handleKeyDown, getDisplayValue]);

  const getColLabel = useCallback((key) => availableColumns.find(c => c.key === key)?.label ?? key, [availableColumns]);

  const handleSaveColumnSettings = useCallback((cols) => {
    setVisibleColumns(cols);
    localStorage.setItem('monthlyOrderVisibleColumns', JSON.stringify(cols));
  }, []);

  const getRowStyle = useCallback((task) => {
    const isSelected = task.id === selectedTaskId;
    const isDragOver = task.id === dragOverTaskId;
    if (task.is_section) return {
      backgroundColor: isSelected ? '#b3d4ff' : getSectionColor(task.level),
      fontWeight: 'bold',
      fontSize: task.level === 0 ? '1.02em' : '1em',
      outline: isSelected ? '2px solid #4a90e2' : 'none',
      borderTop: isDragOver && dragOverPos === 'before' ? '3px solid #4a90e2' : undefined,
      borderBottom: isDragOver && dragOverPos === 'after' ? '3px solid #4a90e2' : undefined,
    };
    return {
      backgroundColor: isSelected ? '#e8f0fe' : task.is_custom ? '#fff9e6' : 'inherit',
      outline: isSelected ? '2px solid #4a90e2' : 'none',
      borderTop: isDragOver && dragOverPos === 'before' ? '3px solid #4a90e2' : undefined,
      borderBottom: isDragOver && dragOverPos === 'after' ? '3px solid #4a90e2' : undefined,
      cursor: task.is_custom && isAdmin ? 'grab' : 'default',
    };
  }, [selectedTaskId, dragOverTaskId, dragOverPos, isAdmin]);

  const getCellStyle = useCallback((task, key) => {
    if (!isAdmin || task.is_section) return {};
    if (isFieldEditable(task, key))
      return { cursor: 'pointer', backgroundColor: editingCell?.taskId === task.id && editingCell?.field === key ? '#ffffcc' : 'inherit' };
    return {};
  }, [isAdmin, isFieldEditable, editingCell]);

  const handleRowClick = useCallback((task) => {
    if (editingCell) return;
    setSelectedTaskId(prev => prev === task.id ? null : task.id);
  }, [editingCell]);

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

  // ─── ПЕЧАТЬ ──────────────────────────────────────────────────────────────────
  /**
   * Шаги:
   * 1. PrintDialog собирает: selectedCols (массив ключей) + ganttScale
   * 2. handlePrint:
   *    а) сохраняет масштаб в localStorage (GanttChart его читает при маунте)
   *    б) создаёт невидимый .print-area div в body
   *    в) рендерит туда таблицу через ReactDOM.render (портал)
   *    г) вызывает window.print()
   *    д) после print — удаляет div
   * Так мы не ломаем текущий DOM — GanttChart на странице не трогаем.
   */
  const handlePrint = useCallback((selectedCols, ganttScale) => {
    setShowPrintDialog(false);

    // Обновляем масштаб Ганта перед печатью
    localStorage.setItem('ganttScale', ganttScale);

    const project = JSON.parse(localStorage.getItem('currentProject') || 'null');
    const projectName = project?.name || 'Проект';
    const monthLabel = new Date(selectedMonth + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

    // Строим HTML таблицы вручную (не React — чтобы не зависеть от DOM)
    const colLabels = selectedCols.map(k => availableColumns.find(c => c.key === k)?.label ?? k);

    const headerRow = colLabels.map(l => `<th>${l}</th>`).join('');
    const bodyRows = filteredTasks.map(task => {
      const bgColor = task.is_section ? getSectionColor(task.level) : (task.is_custom ? '#fff9e6' : '#fff');
      const fw = task.is_section ? 'bold' : 'normal';
      const cells = selectedCols.map(key => {
        const val = getDisplayValue(task, key);
        return `<td style="font-weight:${fw}">${val}</td>`;
      }).join('');
      return `<tr style="background:${bgColor}">${cells}</tr>`;
    }).join('');

    const tableHtml = `
      <table>
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    `;

    // Iframe-подход: гарантирует изоляцию стилей и корректный print
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>МСГ — ${projectName} — ${monthLabel}</title>
        <style>
          @page { size: A3 landscape; margin: 10mm; }
          body { font-family: Arial, sans-serif; font-size: 9px; margin: 0; }
          h2 { font-size: 13px; margin: 0 0 2px; }
          p.sub { font-size: 10px; color: #555; margin: 0 0 8px; }
          table { border-collapse: collapse; width: 100%; table-layout: auto; }
          th, td { border: 1px solid #bbb; padding: 2px 5px; white-space: nowrap; font-size: 9px; }
          th { background: #d0dff0; font-weight: 700; }
          tr { page-break-inside: avoid; }
        </style>
      </head>
      <body>
        <h2>МСГ — ${projectName}</h2>
        <p class="sub">Период: ${monthLabel} &nbsp;|&nbsp; Сформировано: ${new Date().toLocaleDateString('ru-RU')}</p>
        ${tableHtml}
      </body>
      </html>
    `);
    doc.close();

    iframe.contentWindow.focus();
    iframe.contentWindow.print();

    // Удаляем iframe после диалога печати
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 2000);
  }, [filteredTasks, selectedMonth, availableColumns, getDisplayValue]);

  return (
    <div className="monthly-order">
      <div className="month-selector">
        <label>Выберите месяц:</label>
        <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
        <span style={{ fontSize: 13, color: '#666' }}>
          Показаны работы с плановыми датами, попадающими в выбранный месяц
        </span>
        <button
          onClick={handleDeleteHeadcount}
          title="Удалить все назначения людей за выбранный месяц"
          style={{ padding:'4px 12px', background:'#e07b00', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontSize:13, marginLeft:12 }}>
          Удалить назначения
        </button>
        {isAdmin && (
          <div style={{ display:'inline-flex', gap:8, marginLeft:8 }}>
            <button onClick={handleAddCustomRow}
              title={selectedTaskId ? 'Добавить строку выше выделенной' : 'Добавить строку в конец'}
              style={{ padding:'4px 12px', background:'#4a90e2', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontSize:13 }}>
              + Добавить строку
            </button>
            <button onClick={handleDeleteAllCustomRows}
              title="Удалить все ручные строки"
              style={{ padding:'4px 12px', background:'#e55', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontSize:13 }}>
              Удалить все ручные
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
                  {isAdmin && <col style={{ width:'32px' }} />}
                  {visibleColumns.map(k => <col key={k} style={{ width:`${colWidths[k] || 100}px` }} />)}
                </colgroup>
                <thead style={{ height:`${tableHeaderHeight}px` }}>
                  <tr className="thead-labels" style={{ height:`${tableHeaderHeight}px`, verticalAlign:'middle' }}>
                    {isAdmin && <th style={{ width:32, padding:0 }} title="Действия" />}
                    {visibleColumns.map(key => (
                      <th key={key}
                        className={filters[key] ? 'has-filter' : ''}
                        onContextMenu={e => handleThContextMenu(e, key)}
                        title="Правый клик — фильтр"
                        style={{ verticalAlign:'middle' }}
                      >
                        <span className="th-label-text">{getColLabel(key)}</span>
                        <ColumnFilter
                          columnKey={key}
                          allValues={getColumnValues(key)}
                          currentFilter={filters[key] || ''}
                          onApplyFilter={handleFilterApply}
                          triggerEvent={filterTriggers[key]}
                        />
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
            <div className="schedule-gantt-section" style={{ width:`${100 - tableWidth}%` }}>
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
