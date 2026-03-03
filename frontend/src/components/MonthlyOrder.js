import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { scheduleAPI, employeesAPI, headcountAPI, importExportAPI } from '../services/api';
import websocketService from '../services/websocket';
import GanttChart from './GanttChart';
import ColumnSettings from './ColumnSettings';
import ColumnFilter from './ColumnFilter';
import ChecklistFilter from './ChecklistFilter';
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

const COLLAPSED_STORAGE_KEY = 'msgCollapsedSections';

function loadCollapsedFromStorage() {
  try {
    const s = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    return s ? new Set(JSON.parse(s)) : new Set();
  } catch { return new Set(); }
}
function saveCollapsedToStorage(set) {
  try { localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
}

function getPositionalDescendantIds(sectionIdx, allTasks) {
  const section = allTasks[sectionIdx];
  if (!section || !section.is_section) return new Set();
  const sectionLevel = getLevelFromCode(section.code);
  const sectionCodePrefix = section.code + '.';
  const ids = new Set();
  for (let i = sectionIdx + 1; i < allTasks.length; i++) {
    const t = allTasks[i];
    if (t.is_section) {
      const tLevel = getLevelFromCode(t.code);
      if (tLevel <= sectionLevel) break;
      ids.add(t.id);
    } else {
      const code = String(t.code);
      if (t.is_custom || !code.startsWith(sectionCodePrefix)) {
        if (t.is_custom) ids.add(t.id);
        else break;
      } else {
        ids.add(t.id);
      }
    }
  }
  return ids;
}

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
  notes: 200,
};

const LEFT_ALIGN_COLS = new Set(['code', 'name', 'notes']);

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

const STANDARD_EDITABLE = ['start_date_plan', 'end_date_plan', 'executor', 'notes'];
const CUSTOM_EDITABLE = [
  'name', 'unit', 'volume_plan',
  'start_date_plan', 'end_date_plan',
  'unit_price', 'labor_per_unit', 'machine_hours_per_unit', 'executor', 'notes',
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
  hasChildren, isCollapsed,
  getRowStyle, getCellStyle, getCellValue, isFieldEditable,
  onRowClick, onCellDoubleClick,
  onDragStart, onDragOver, onDragLeave, onDragEnd, onDrop,
  onDeleteCustomRow, onToggleSection,
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
      {visibleColumns.map(key => {
        if (key === 'name' && task.is_section) {
          const nameText = typeof getCellValue(task, key) === 'string'
            ? getCellValue(task, key)
            : task.name;
          return (
            <td key={key} style={getCellStyle(task, key)}
              onDoubleClick={() => onCellDoubleClick(task, key)}
              title={isFieldEditable(task, key) ? 'Двойной клик для редактирования' : ''}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {hasChildren && (
                  <button
                    onClick={e => { e.stopPropagation(); onToggleSection(task.id); }}
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
        return (
          <td key={key}
            style={getCellStyle(task, key)}
            onDoubleClick={() => onCellDoubleClick(task, key)}
            title={isFieldEditable(task, key) ? 'Двойной клик для редактирования' : ''}
          >
            {getCellValue(task, key)}
          </td>
        );
      })}
    </tr>
  );
});

function MonthlyOrder({ showGantt, onShowColumnSettings, onShowFilters, onShowPrint, onShowExportMSG, onShowImportMSG }) {
  const { user } = useAuth();
  const isAdmin = useMemo(() => user?.role === 'admin', [user]);

  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const [filters, setFilters] = useState({});

  const [collapsedSections, setCollapsedSections] = useState(() => loadCollapsedFromStorage());

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
    filteredTasks.forEach((task, idx) => {
      if (task.is_section && collapsedSections.has(task.id)) {
        getPositionalDescendantIds(idx, filteredTasks).forEach(id => hiddenIds.add(id));
      }
    });
    return filteredTasks.filter(t => !hiddenIds.has(t.id));
  }, [filteredTasks, collapsedSections]);

  const sectionHasChildren = useCallback((section) => {
    const idx = filteredTasks.findIndex(t => t.id === section.id);
    if (idx === -1) return false;
    return getPositionalDescendantIds(idx, filteredTasks).size > 0;
  }, [filteredTasks]);

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

  const selectedMonthRef = useRef(selectedMonth);
  useEffect(() => { selectedMonthRef.current = selectedMonth; }, [selectedMonth]);

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

  const availableColumns = useMemo(() => [
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
    { key: 'notes',                   label: 'Примечание',           editable: true },
  ], []);

  const defaultColumns = [
    'code', 'name', 'cl_people', 'cl_equipment', 'cl_mtr', 'cl_access',
    'unit', 'volume_plan', 'volume_fact', 'volume_remaining',
    'start_date_contract', 'end_date_contract', 'start_date_plan', 'end_date_plan',
  ];

  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const s = localStorage.getItem('monthlyOrderVisibleColumns');
      if (s) {
        const parsed = JSON.parse(s);
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
      if (count === null) {
        await headcountAPI.deleteOne(taskId, dateStr);
        setHeadcountData(prev => {
          const taskData = { ...(prev[taskId] || {}) };
          delete taskData[dateStr];
          return { ...prev, [taskId]: taskData };
        });
      } else {
        await headcountAPI.upsert(taskId, dateStr, count);
        setHeadcountData(prev => ({
          ...prev,
          [taskId]: { ...(prev[taskId] || {}), [dateStr]: count },
        }));
      }
    } catch (e) { console.error(e); alert('Не удалось сохранить'); }
  }, []);

  const handleDeleteHeadcount = useCallback(async () => {
    if (!window.confirm(`Удалить все назначения людей за ${selectedMonth}?`)) return;
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      await headcountAPI.deleteByMonth(year, month);
      setHeadcountData({});
    } catch (e) { console.error(e); alert('Не удалось удалить'); }
  }, [selectedMonth]);

  const handleExportMSG = useCallback(async () => {
    try {
      const [year, month] = selectedMonthRef.current.split('-').map(Number);
      const response = await importExportAPI.exportMSG(year, month);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `msg_${year}_${String(month).padStart(2, '0')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Ошибка скачивания МСГ: ' + (error.response?.data?.detail || error.message));
    }
  }, []);

  const handleImportMSG = useCallback(async (file) => {
    try {
      const [year, month] = selectedMonthRef.current.split('-').map(Number);
      const response = await importExportAPI.uploadMSG(file, year, month);
      const { records_created, records_updated, errors } = response.data;
      let message = `МСГ обновлён:\nСоздано записей: ${records_created}\nОбновлено записей: ${records_updated}`;
      if (errors && errors.length > 0) {
        message += `\n\nОшибки:\n${errors.join('\n')}`;
      }
      alert(message);
      await loadHeadcount();
    } catch (error) {
      alert('Ошибка загрузки МСГ: ' + (error.response?.data?.detail || error.message));
    }
  }, [loadHeadcount]);

  useEffect(() => { if (onShowColumnSettings) onShowColumnSettings(() => setShowColumnSettings(true)); }, [onShowColumnSettings]);
  useEffect(() => { if (onShowFilters) onShowFilters(() => setShowFilterManager(true)); }, [onShowFilters]);
  useEffect(() => { if (onShowPrint) onShowPrint(() => setShowPrintDialog(true)); }, [onShowPrint]);
  useEffect(() => { if (onShowExportMSG) onShowExportMSG(handleExportMSG); }, [onShowExportMSG, handleExportMSG]);
  useEffect(() => { if (onShowImportMSG) onShowImportMSG(handleImportMSG); }, [onShowImportMSG, handleImportMSG]);

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

  const handleStatusChange = useCallback(async (taskId, field, value) => {
    try {
      await scheduleAPI.updateTask(taskId, { [field]: value });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: value } : t));
    } catch (e) { console.error('Ошибка сохранения статуса:', e); }
  }, []);

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
    if (CHECKLIST_COL_KEYS.has(key)) return null;
    if (task.is_section) {
      const sumCols = ['labor_total','labor_fact','labor_remaining','cost_total','cost_fact','cost_remaining','machine_hours_total','machine_hours_fact','machine_hours_remaining'];
      if (sumCols.includes(key)) return calculateSectionSum(task, key).toFixed(2);
      if (['volume_plan','volume_fact','volume_remaining','unit','unit_price','labor_per_unit','machine_hours_per_unit','executor','notes'].includes(key)) return '-';
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
      case 'notes': return task.notes || '';
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
      return activeFilters.every(([k, v]) => {
        if (CHECKLIST_COL_KEYS.has(k)) {
          const fieldKey = CHECKLIST_COL_TO_FIELD[k];
          return (t[fieldKey] || 'gray') === v;
        }
        return String(getDisplayValue(t, k) || '').toLowerCase().includes(v.toLowerCase());
      });
    });
    const parentIds = new Set();
    matchedWorks.forEach(t => getParentIds(t, tasks).forEach(id => parentIds.add(id)));
    const matchedWorkIds = new Set(matchedWorks.map(t => t.id));
    setFilteredTasks(tasks.filter(t => matchedWorkIds.has(t.id) || (t.is_section && parentIds.has(t.id))));
  };

  const handleFilterApply = useCallback((k, v) => setFilters(prev => ({ ...prev, [k]: v })), []);
  const handleClearAllFilters = useCallback(() => { setFilters({}); setShowFilterManager(false); }, []);

  const getColumnValues = useCallback((key) => {
    if (CHECKLIST_COL_KEYS.has(key)) return [];
    const active = Object.entries(filters).filter(([k, v]) => k !== key && v && v.trim());
    let arr = tasks.filter(t => !t.is_section);
    active.forEach(([k, v]) => { arr = arr.filter(t => String(getDisplayValue(t, k) || '').toLowerCase().includes(v.toLowerCase())); });
    return arr.map(t => getDisplayValue(t, key));
  }, [filters, tasks, getDisplayValue]);

  const handleThContextMenu = useCallback((e, colKey) => {
    e.preventDefault();
    setFilterTriggers(prev => ({ ...prev, [colKey]: { clientX: e.clientX, clientY: e.clientY, _id: Date.now() } }));
  }, []);

  const isFieldEditable = useCallback((task, key) => {
    if (CHECKLIST_COL_KEYS.has(key)) return false;
    if (task.is_section) return false;
    if (key === 'notes') return true;
    if (!isAdmin) return false;
    if (task.is_custom) return CUSTOM_EDITABLE.includes(key);
    return STANDARD_EDITABLE.includes(key);
  }, [isAdmin]);

  const handleCellDoubleClick = useCallback((task, key) => {
    if (CHECKLIST_COL_KEYS.has(key)) return;
    if (!isFieldEditable(task, key)) return;
    setEditingCell({ taskId: task.id, field: key });
    let val = '';
    if (key === 'notes') val = task.notes || '';
    else if (DATE_FIELDS.includes(key)) val = task[key] ? new Date(task[key]).toISOString().split('T')[0] : '';
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
    let cur;
    if (ec.field === 'notes') cur = task.notes || '';
    else if (DATE_FIELDS.includes(ec.field)) cur = task[ec.field] ? new Date(task[ec.field]).toISOString().split('T')[0] : '';
    else cur = task[ec.field] !== null && task[ec.field] !== undefined ? String(task[ec.field]) : '';
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
    if (editingCellRef.current?.field === 'notes') {
      if (e.key === 'Escape') setEditingCell(null);
      return;
    }
    if (e.key === 'Enter') handleCellBlur();
    else if (e.key === 'Escape') setEditingCell(null);
  }, [handleCellBlur]);

  const getCellValue = useCallback((task, key) => {
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
      if (key === 'notes') return (
        <textarea
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={handleCellBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          rows={3}
          style={{ width: '100%', padding: '2px', resize: 'vertical', fontSize: 'inherit', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
      );
      if (key === 'executor') return (
        <select value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={handleCellBlur} onKeyDown={handleKeyDown} autoFocus style={{ width: '100%', padding: '2px' }}>
          <option value="">Не выбран</option>
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
    if (key === 'notes') {
      const txt = task.notes || '';
      return (
        <span style={{ display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, color: txt ? 'inherit' : '#bbb' }}
          title={txt}>{txt || '—'}</span>
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
    if (CHECKLIST_COL_KEYS.has(key)) return { textAlign: 'center', padding: '2px 4px' };
    const align = LEFT_ALIGN_COLS.has(key) ? 'left' : 'center';
    const base = { textAlign: align, padding: '2px 6px' };
    if (task.is_section) return base;
    if (isFieldEditable(task, key)) {
      return {
        ...base,
        cursor: 'pointer',
        backgroundColor: editingCell?.taskId === task.id && editingCell?.field === key ? '#ffffcc' : 'inherit',
      };
    }
    return base;
  }, [isFieldEditable, editingCell]);

  const handleRowClick = useCallback((task) => {
    if (editingCellRef.current) return;
    setSelectedTaskId(prev => prev === task.id ? null : task.id);
  }, []);

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
        const w = Math.max(40, colResizeRef.current.startWidth + ev.clientX - colResizeRef.current.startX);
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
    const projectName = project?.name || 'Проект';
    const monthLabel = new Date(selectedMonth + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    const ROW_H = 24;
    const printCols = selectedCols.filter(k => !CHECKLIST_COL_KEYS.has(k));
    const colLabels = printCols.map(k => availableColumns.find(c => c.key === k)?.label ?? k);
    const printTasks = filteredTasks;

    // ===== Гант-контекст: вычисляем один раз =====
    const SCALE_PPD = { year: 1, quarter: 3, month: 5, week: 15, day: 60 };
    const ppd = SCALE_PPD[ganttScale] || 5;
    let minDate = null, maxDate = null, totalDays = 0, totalWidth = 0;
    let timeMarks = [];
    let gridLines = '';
    let headerMarks = '';

    if (showGantt) {
      const workTasks = printTasks.filter(t => !t.is_section && (t.start_date_plan || t.start_date_contract));
      if (workTasks.length > 0) {
        const allDates = [];
        workTasks.forEach(t => {
          if (t.start_date_contract) allDates.push(new Date(t.start_date_contract));
          if (t.end_date_contract)   allDates.push(new Date(t.end_date_contract));
          if (t.start_date_plan)     allDates.push(new Date(t.start_date_plan));
          if (t.end_date_plan)       allDates.push(new Date(t.end_date_plan));
        });
        minDate = new Date(Math.min(...allDates)); minDate.setHours(0, 0, 0, 0);
        maxDate = new Date(Math.max(...allDates)); maxDate.setHours(23, 59, 59, 999);
        totalDays = Math.ceil((maxDate - minDate) / 864e5) + 1;
        totalWidth = totalDays * ppd;

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

        gridLines = timeMarks.map(m =>
          `<div style="position:absolute;left:${m.offset * ppd}px;top:0;bottom:0;width:1px;background:#e0e0e0;"></div>`
        ).join('');
        headerMarks = timeMarks.map(m =>
          `<div style="position:absolute;left:${m.offset * ppd}px;top:0;height:100%;border-left:1px solid #ccc;font-size:8px;padding-left:2px;white-space:nowrap;color:#333;overflow:hidden;">${m.label}</div>`
        ).join('');
      }
    }

    // ===== Строим единую таблицу: каждая <tr> = данные + гант =====
    const ganttTd = (content, bg) => showGantt && totalWidth > 0
      ? `<td class="gantt-cell" style="background:${bg};-webkit-print-color-adjust:exact;print-color-adjust:exact;">
           <div style="position:relative;width:${totalWidth}px;height:${ROW_H}px;overflow:hidden;">${gridLines}${content}</div>
         </td>`
      : '';

    // Строка заголовка: названия колонок слева + заголовок ганта справа
    const headerCells = colLabels.map(l =>
      `<td style="background:#d0dff0;font-weight:700;text-align:center;border:1px solid #bbb;padding:0 4px;white-space:nowrap;font-size:9px;height:${ROW_H}px;vertical-align:middle;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${l}</td>`
    ).join('');
    const ganttHeaderTd = showGantt && totalWidth > 0
      ? `<td class="gantt-cell" style="background:#e0e8f5;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
           <div style="position:relative;width:${totalWidth}px;height:${ROW_H}px;overflow:hidden;">${headerMarks}</div>
         </td>`
      : '';
    const headerRow = `<tr style="height:${ROW_H}px;page-break-inside:avoid;">${headerCells}${ganttHeaderTd}</tr>`;

    // Строки данных
    const bodyRows = printTasks.map(task => {
      const bgColor = task.is_section ? getSectionColor(getLevelFromCode(task.code)) : (task.is_custom ? '#fff9e6' : '#fff');
      const fw = task.is_section ? 'bold' : 'normal';
      const dataCells = printCols.map(key =>
        `<td style="font-weight:${fw};">${getDisplayValue(task, key) || ''}</td>`
      ).join('');

      // Гант-бары для этой строки
      let bars = '';
      if (showGantt && totalWidth > 0 && !task.is_section && minDate) {
        if (task.start_date_contract && task.end_date_contract) {
          const s = new Date(task.start_date_contract); s.setHours(0,0,0,0);
          const e = new Date(task.end_date_contract);   e.setHours(0,0,0,0);
          const left = Math.floor((s - minDate) / 864e5) * ppd;
          const w = Math.max((Math.floor((e - s) / 864e5) + 1) * ppd, 4);
          bars += `<div style="position:absolute;left:${left}px;top:${Math.round(ROW_H*0.15)}px;width:${w}px;height:${Math.round(ROW_H*0.28)}px;background:#aaa;border-radius:2px;"></div>`;
        }
        if (task.start_date_plan && task.end_date_plan) {
          const s = new Date(task.start_date_plan); s.setHours(0,0,0,0);
          const e = new Date(task.end_date_plan);   e.setHours(0,0,0,0);
          const left = Math.floor((s - minDate) / 864e5) * ppd;
          const w = Math.max((Math.floor((e - s) / 864e5) + 1) * ppd, 4);
          bars += `<div style="position:absolute;left:${left}px;top:${Math.round(ROW_H*0.55)}px;width:${w}px;height:${Math.round(ROW_H*0.28)}px;background:#4a90e2;border-radius:2px;"></div>`;
        }
      }

      return `<tr style="height:${ROW_H}px;background:${bgColor};page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
        ${dataCells}
        ${ganttTd(bars, bgColor)}
      </tr>`;
    }).join('');

    const legendHtml = showGantt && totalWidth > 0 ? `
      <div style="margin-top:6px;font-size:10px;color:#555;">
        <span style="display:inline-block;width:16px;height:8px;background:#aaa;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>Контракт
        &nbsp;&nbsp;
        <span style="display:inline-block;width:16px;height:8px;background:#4a90e2;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>План
      </div>` : '';

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8" />
      <title>МСГ — ${projectName} — ${monthLabel}</title>
      <style>
        @page { size: A3 landscape; margin: 8mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 9px; }
        h2 { font-size: 13px; margin-bottom: 2px; }
        p.sub { font-size: 10px; color: #555; margin-bottom: 6px; }
        table { border-collapse: collapse; table-layout: fixed; }
        td {
          border: 1px solid #bbb;
          padding: 0 4px;
          white-space: nowrap;
          font-size: 9px;
          vertical-align: middle;
          height: ${ROW_H}px;
          overflow: hidden;
        }
        td.gantt-cell { border: none; border-left: 1px solid #bbb; padding: 0; width: ${totalWidth}px; min-width: ${totalWidth}px; }
        tr { page-break-inside: avoid; }
        tr[style*="#B8D4E8"] td:not(.gantt-cell) { background: #B8D4E8 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        tr[style*="#C8DFF0"] td:not(.gantt-cell) { background: #C8DFF0 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        tr[style*="#D8EAF5"] td:not(.gantt-cell) { background: #D8EAF5 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        tr[style*="#E4F1F8"] td:not(.gantt-cell) { background: #E4F1F8 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        tr[style*="#EFF6FB"] td:not(.gantt-cell) { background: #EFF6FB !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        tr[style*="#fff9e6"] td:not(.gantt-cell) { background: #fff9e6 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      </style>
    </head><body>
      <h2>МСГ — ${projectName}</h2>
      <p class="sub">Период: ${monthLabel} &nbsp;|&nbsp; Сформировано: ${new Date().toLocaleDateString('ru-RU')}</p>
      <table>
        <tbody>
          ${headerRow}
          ${bodyRows}
        </tbody>
      </table>
      ${legendHtml}
    </body></html>`);
    doc.close();
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 2000);
  }, [filteredTasks, selectedMonth, availableColumns, getDisplayValue, showGantt]);

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
          style={{ padding: '4px 12px', background: '#e07b00', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, marginLeft: 12 }}
        >
          Удалить назначения
        </button>
        {isAdmin && (
          <div style={{ display: 'inline-flex', gap: 8, marginLeft: 8 }}>
            <button
              onClick={handleAddCustomRow}
              title={selectedTaskId ? 'Добавить строку выше выделенной' : 'Добавить строку в конец'}
              style={{ padding: '4px 12px', background: '#4a90e2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
            >
              + Добавить строку
            </button>
            <button
              onClick={handleDeleteAllCustomRows}
              title="Удалить все ручные строки"
              style={{ padding: '4px 12px', background: '#e55', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
            >
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
                  {isAdmin && <col style={{ width: '32px' }} />}
                  {visibleColumns.map(k => <col key={k} style={{ width: `${colWidths[k] || 60}px` }} />)}
                </colgroup>
                <thead style={{ height: `${tableHeaderHeight}px` }}>
                  <tr className="thead-labels" style={{ height: `${tableHeaderHeight}px`, verticalAlign: 'middle' }}>
                    {isAdmin && <th style={{ width: 32, padding: 0 }} title="Действия" />}
                    {visibleColumns.map(key => {
                      const isClCol = CHECKLIST_COL_KEYS.has(key);
                      const hasFilter = !!filters[key];
                      return (
                        <th key={key}
                          className={hasFilter ? 'has-filter' : ''}
                          onContextMenu={e => handleThContextMenu(e, key)}
                          title="Правый клик — фильтр"
                          style={{ verticalAlign: 'middle', textAlign: 'center' }}
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
                    <TaskRow
                      key={task.id}
                      task={task}
                      visibleColumns={visibleColumns}
                      isAdmin={isAdmin}
                      isEditing={editingCell?.taskId === task.id}
                      isSelected={selectedTaskId === task.id}
                      isDragOver={dragOverTaskId === task.id}
                      dragOverPos={dragOverPos}
                      hasChildren={task.is_section ? sectionHasChildren(task) : false}
                      isCollapsed={collapsedSections.has(task.id)}
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
                      onToggleSection={toggleSection}
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
                tasks={visibleTasks}
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
