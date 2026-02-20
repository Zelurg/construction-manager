import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { scheduleAPI, employeesAPI } from '../services/api';
import websocketService from '../services/websocket';
import GanttChart from './GanttChart';
import ColumnSettings from './ColumnSettings';
import ColumnFilter from './ColumnFilter';
import FilterManager from './FilterManager';
import { useAuth } from '../contexts/AuthContext';

const SECTION_COLORS = [
  '#B8D4E8', '#C8DFF0', '#D8EAF5', '#E4F1F8', '#EFF6FB',
];
function getSectionColor(level) {
  return SECTION_COLORS[Math.min(Math.max(level || 0, 0), SECTION_COLORS.length - 1)];
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

const DEFAULT_COL_WIDTHS = {
  code: 90, name: 280, unit: 60, volume_plan: 90, volume_fact: 90,
  volume_remaining: 90, start_date_contract: 110, end_date_contract: 110,
  start_date_plan: 110, end_date_plan: 110, unit_price: 90,
  labor_per_unit: 100, machine_hours_per_unit: 110, executor: 150,
  labor_total: 100, labor_fact: 100, labor_remaining: 110,
  cost_total: 100, cost_fact: 100, cost_remaining: 110,
  machine_hours_total: 110, machine_hours_fact: 110, machine_hours_remaining: 120,
};

function Schedule({ showGantt, onShowColumnSettings, onShowFilters }) {
  const { user } = useAuth();
  const isAdmin = useMemo(() => user?.role === 'admin', [user]);

  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [filters, setFilters] = useState({});
  const [tableWidth, setTableWidth] = useState(60);
  const [isResizing, setIsResizing] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showFilterManager, setShowFilterManager] = useState(false);
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [employees, setEmployees] = useState([]);
  const [colWidths, setColWidths] = useState(() => {
    try {
      const s = localStorage.getItem('scheduleColWidths');
      return s ? { ...DEFAULT_COL_WIDTHS, ...JSON.parse(s) } : { ...DEFAULT_COL_WIDTHS };
    } catch { return { ...DEFAULT_COL_WIDTHS }; }
  });

  // Ref для доступа к актуальному tasks внутри getBreadcrumb
  // без проблем со stale closure
  const tasksRef = useRef([]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  const containerRef   = useRef(null);
  const tableScrollRef = useRef(null);
  const ganttBodyRef   = useRef(null);
  const syncingRef     = useRef(false);
  const colResizeRef   = useRef({ active: false, colKey: null, startX: 0, startWidth: 0 });

  const availableColumns = [
    { key: 'code',                    label: 'Шифр' },
    { key: 'name',                    label: 'Наименование' },
    { key: 'unit',                    label: 'Ед. изм.' },
    { key: 'volume_plan',             label: 'Объём план' },
    { key: 'volume_fact',             label: 'Объём факт' },
    { key: 'volume_remaining',        label: 'Объём остаток',  isCalculated: true },
    { key: 'start_date_contract',     label: 'Дата старта контракт' },
    { key: 'end_date_contract',       label: 'Дата финиша контракт' },
    { key: 'start_date_plan',         label: 'Дата старта план',    editable: true },
    { key: 'end_date_plan',           label: 'Дата финиша план',    editable: true },
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
    'code','name','unit','volume_plan','volume_fact','volume_remaining',
    'start_date_contract','end_date_contract','start_date_plan','end_date_plan',
  ];
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const s = localStorage.getItem('scheduleVisibleColumns');
    return s ? JSON.parse(s) : defaultColumns;
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
      const w = Math.max(50, colResizeRef.current.startWidth + ev.clientX - colResizeRef.current.startX);
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
    const onCreated  = (msg) => setTasks(prev => [...prev, msg.data].sort(compareCode));
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

  useEffect(() => { applyFilters(); }, [tasks, filters]);

  const loadTasks = async () => {
    try { const r = await scheduleAPI.getTasks(); setTasks([...r.data].sort(compareCode)); }
    catch (e) { console.error('Ошибка загрузки задач:', e); }
  };
  const loadEmployees = async () => {
    try { const r = await employeesAPI.getAll({ active_only: true }); setEmployees(r.data); }
    catch (e) { console.error('Ошибка загрузки сотрудников:', e); }
  };

  // Ищем родителей через tasksRef чтобы избежать stale closure
  const getBreadcrumb = (task) => {
    if (!task.parent_code) return '';
    const allTasks = tasksRef.current;
    const crumbs = [];
    let cur = task.parent_code;
    while (cur) {
      const p = allTasks.find(t => t.code === cur);
      if (p) { crumbs.unshift(p.name); cur = p.parent_code; } else break;
    }
    return crumbs.length ? crumbs.join(' / ') + ' / ' : '';
  };

  const getChildTasks = (sectionCode, arr) => {
    const children = [];
    const find = (pc) => arr.forEach(t => {
      if (t.parent_code === pc) { if (t.is_section) find(t.code); else children.push(t); }
    });
    find(sectionCode);
    return children;
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
      default:
        return task[key] !== undefined && task[key] !== null ? String(task[key]) : '-';
    }
  };

  const applyFilters = () => {
    const activeFilters = Object.entries(filters).filter(([, v]) => v && v.trim());
    if (activeFilters.length === 0) { setFilteredTasks(tasks); return; }

    const matchingWorks = tasks.filter(t => {
      if (t.is_section) return false;
      return activeFilters.every(([k, v]) =>
        getDisplayValue(t, k).toLowerCase().includes(v.toLowerCase())
      );
    });

    const neededSectionCodes = new Set();
    matchingWorks.forEach(work => {
      let cur = work.parent_code;
      while (cur) {
        neededSectionCodes.add(cur);
        const parent = tasks.find(t => t.code === cur);
        cur = parent?.parent_code || null;
      }
    });

    const result = tasks.filter(t =>
      t.is_section ? neededSectionCodes.has(t.code) : matchingWorks.includes(t)
    );
    setFilteredTasks(result);
  };

  const handleFilterApply = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));
  const handleClearAllFilters = () => { setFilters({}); setShowFilterManager(false); };

  const getColumnValues = (key) => {
    const active = Object.entries(filters).filter(([k, v]) => k !== key && v && v.trim());
    let arr = tasks.filter(t => !t.is_section);
    active.forEach(([k, v]) => {
      arr = arr.filter(t => getDisplayValue(t, k).toLowerCase().includes(v.toLowerCase()));
    });
    return arr.map(t => getDisplayValue(t, key));
  };

  const handleCellDoubleClick = (task, key) => {
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
    if (key === 'name') {
      const hasFilters = Object.values(filters).some(f => f && f.trim());
      const crumb = (hasFilters && !task.is_section) ? getBreadcrumb(task) : '';
      return crumb
        ? <span><span style={{ color:'#888', fontSize:'0.82em', fontStyle:'italic' }}>{crumb}</span>{task.name}</span>
        : task.name;
    }
    return getDisplayValue(task, key);
  };

  const getColLabel = (key) => availableColumns.find(c => c.key === key)?.label ?? key;

  const handleSaveColumnSettings = (cols) => {
    setVisibleColumns(cols);
    localStorage.setItem('scheduleVisibleColumns', JSON.stringify(cols));
  };

  const getRowStyle = (task) => !task.is_section ? {} : {
    backgroundColor: getSectionColor(task.level),
    fontWeight: 'bold',
    fontSize: task.level === 0 ? '1.02em' : '1em',
  };

  const getCellStyle = (task, key) => {
    if (!isAdmin || task.is_section) return {};
    if (['start_date_plan','end_date_plan','executor'].includes(key))
      return { cursor: 'pointer', backgroundColor: editingCell?.taskId === task.id && editingCell?.field === key ? '#ffffcc' : 'inherit' };
    return {};
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

  return (
    <div className="schedule-container-integrated" ref={containerRef}
      style={{ userSelect: isResizing ? 'none' : 'auto' }}>
      <div className="schedule-split-view">
        <div className="schedule-table-section"
          style={{ width: showGantt ? `${tableWidth}%` : '100%' }}
          ref={tableScrollRef}>
          <div className="table-wrapper">
            <table className="tasks-table-integrated">
              <colgroup>
                {visibleColumns.map(k => <col key={k} style={{ width: `${colWidths[k] || 100}px` }} />)}
              </colgroup>
              <thead>
                <tr className="thead-labels">
                  {visibleColumns.map(key => (
                    <th key={key}>
                      <span className="th-label-text">{getColLabel(key)}</span>
                      <ColumnFilter
                        columnKey={key}
                        columnLabel=""
                        allValues={getColumnValues(key)}
                        currentFilter={filters[key] || ''}
                        onApplyFilter={handleFilterApply}
                      />
                      <div className="col-resize-handle"
                        onMouseDown={(e) => handleColResizeMouseDown(e, key)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map(task => (
                  <tr key={task.id} style={getRowStyle(task)}>
                    {visibleColumns.map(key => (
                      <td key={key} style={getCellStyle(task, key)}
                        onDoubleClick={() => handleCellDoubleClick(task, key)}
                        title={isAdmin && !task.is_section && ['start_date_plan','end_date_plan','executor'].includes(key) ? 'Двойной клик для редактирования' : ''}>
                        {getCellValue(task, key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showGantt && <div className="resize-divider" onMouseDown={handleMouseDown}><div className="resize-handle" /></div>}

        {showGantt && (
          <div className="schedule-gantt-section" style={{ width: `${100 - tableWidth}%` }}>
            <GanttChart tasks={filteredTasks} externalScrollRef={ganttBodyRef} />
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
    </div>
  );
}

export default Schedule;
