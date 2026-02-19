import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { scheduleAPI, employeesAPI } from '../services/api';
import websocketService from '../services/websocket';
import GanttChart from './GanttChart';
import ColumnSettings from './ColumnSettings';
import ColumnFilter from './ColumnFilter';
import FilterManager from './FilterManager';
import { useAuth } from '../contexts/AuthContext';

/**
 * Цвета разделов по уровням — единый синий диапазон,
 * level 0 самый тёмный, глубже — светлее.
 */
const SECTION_COLORS = [
  '#B8D4E8',  // level 0
  '#C8DFF0',  // level 1
  '#D8EAF5',  // level 2
  '#E4F1F8',  // level 3
  '#EFF6FB',  // level 4+
];

function getSectionColor(level) {
  const idx = Math.min(Math.max(level || 0, 0), SECTION_COLORS.length - 1);
  return SECTION_COLORS[idx];
}

function parseCode(code) {
  if (!code) return [];
  return String(code).split('.').map(seg => {
    const n = parseInt(seg, 10);
    return isNaN(n) ? seg : n;
  });
}

function compareCode(a, b) {
  const pa = parseCode(a.code);
  const pb = parseCode(b.code);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const sa = pa[i] ?? -1;
    const sb = pb[i] ?? -1;
    if (sa < sb) return -1;
    if (sa > sb) return 1;
  }
  return 0;
}

// Ширины колонок по умолчанию
const DEFAULT_COL_WIDTHS = {
  code: 90,
  name: 280,
  unit: 60,
  volume_plan: 90,
  volume_fact: 90,
  volume_remaining: 90,
  start_date_contract: 110,
  end_date_contract: 110,
  start_date_plan: 110,
  end_date_plan: 110,
  unit_price: 90,
  labor_per_unit: 100,
  machine_hours_per_unit: 110,
  executor: 150,
  labor_total: 100,
  labor_fact: 100,
  labor_remaining: 110,
  cost_total: 100,
  cost_fact: 100,
  cost_remaining: 110,
  machine_hours_total: 110,
  machine_hours_fact: 110,
  machine_hours_remaining: 120,
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
      const saved = localStorage.getItem('scheduleColWidths');
      return saved ? { ...DEFAULT_COL_WIDTHS, ...JSON.parse(saved) } : { ...DEFAULT_COL_WIDTHS };
    } catch { return { ...DEFAULT_COL_WIDTHS }; }
  });

  const containerRef = useRef(null);
  const tableScrollRef = useRef(null);
  const ganttBodyRef = useRef(null);
  const syncingRef = useRef(false);
  const colResizeRef = useRef({ active: false, colKey: null, startX: 0, startWidth: 0 });

  const availableColumns = [
    { key: 'code', label: 'Шифр', isBase: true },
    { key: 'name', label: 'Наименование', isBase: true },
    { key: 'unit', label: 'Ед. изм.', isBase: true },
    { key: 'volume_plan', label: 'Объём план', isBase: true },
    { key: 'volume_fact', label: 'Объём факт', isBase: true },
    { key: 'volume_remaining', label: 'Объём остаток', isBase: false, isCalculated: true },
    { key: 'start_date_contract', label: 'Дата старта контракт', isBase: true },
    { key: 'end_date_contract', label: 'Дата финиша контракт', isBase: true },
    { key: 'start_date_plan', label: 'Дата старта план', isBase: true, editable: true },
    { key: 'end_date_plan', label: 'Дата финиша план', isBase: true, editable: true },
    { key: 'unit_price', label: 'Цена за ед.', isBase: false },
    { key: 'labor_per_unit', label: 'Трудозатраты/ед.', isBase: false },
    { key: 'machine_hours_per_unit', label: 'Машиночасы/ед.', isBase: false },
    { key: 'executor', label: 'Исполнитель', isBase: false, editable: true },
    { key: 'labor_total', label: 'Всего трудозатрат', isBase: false, isCalculated: true },
    { key: 'labor_fact', label: 'Трудозатраты факт', isBase: false, isCalculated: true },
    { key: 'labor_remaining', label: 'Остаток трудозатрат', isBase: false, isCalculated: true },
    { key: 'cost_total', label: 'Стоимость всего', isBase: false, isCalculated: true },
    { key: 'cost_fact', label: 'Стоимость факт', isBase: false, isCalculated: true },
    { key: 'cost_remaining', label: 'Остаток стоимости', isBase: false, isCalculated: true },
    { key: 'machine_hours_total', label: 'Всего машиночасов', isBase: false, isCalculated: true },
    { key: 'machine_hours_fact', label: 'Машиночасы факт', isBase: false, isCalculated: true },
    { key: 'machine_hours_remaining', label: 'Остаток машиночасов', isBase: false, isCalculated: true },
  ];

  const defaultColumns = ['code', 'name', 'unit', 'volume_plan', 'volume_fact', 'volume_remaining',
    'start_date_contract', 'end_date_contract', 'start_date_plan', 'end_date_plan'];
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('scheduleVisibleColumns');
    return saved ? JSON.parse(saved) : defaultColumns;
  });

  // ── Синхронизация вертикального скролла таблица ↔ гант ──
  useEffect(() => {
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
  }, [showGantt]);

  // ── Resize колонок ──
  const handleColResizeMouseDown = useCallback((e, colKey) => {
    e.preventDefault();
    e.stopPropagation();
    colResizeRef.current = {
      active: true,
      colKey,
      startX: e.clientX,
      startWidth: colWidths[colKey] || DEFAULT_COL_WIDTHS[colKey] || 100,
    };

    const onMouseMove = (ev) => {
      if (!colResizeRef.current.active) return;
      const delta = ev.clientX - colResizeRef.current.startX;
      const newWidth = Math.max(50, colResizeRef.current.startWidth + delta);
      setColWidths(prev => ({ ...prev, [colResizeRef.current.colKey]: newWidth }));
    };
    const onMouseUp = () => {
      colResizeRef.current.active = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      // Сохраняем в localStorage
      setColWidths(prev => {
        localStorage.setItem('scheduleColWidths', JSON.stringify(prev));
        return prev;
      });
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [colWidths]);

  useEffect(() => {
    if (onShowColumnSettings) onShowColumnSettings(() => setShowColumnSettings(true));
  }, [onShowColumnSettings]);

  useEffect(() => {
    if (onShowFilters) onShowFilters(() => setShowFilterManager(true));
  }, [onShowFilters]);

  useEffect(() => {
    loadTasks();
    loadEmployees();
    websocketService.connect();

    const handleTaskCreated    = (msg) => setTasks(prev => [...prev, msg.data].sort(compareCode));
    const handleTaskUpdated    = (msg) => setTasks(prev => prev.map(t => t.id === msg.data.id ? { ...t, ...msg.data } : t));
    const handleTaskDeleted    = (msg) => setTasks(prev => prev.filter(t => t.id !== msg.data.id));
    const handleScheduleCleared = ()  => { setTasks([]); setFilteredTasks([]); setTimeout(loadTasks, 100); };

    websocketService.on('task_created',      handleTaskCreated);
    websocketService.on('task_updated',      handleTaskUpdated);
    websocketService.on('task_deleted',      handleTaskDeleted);
    websocketService.on('schedule_cleared',  handleScheduleCleared);

    return () => {
      websocketService.off('task_created',     handleTaskCreated);
      websocketService.off('task_updated',     handleTaskUpdated);
      websocketService.off('task_deleted',     handleTaskDeleted);
      websocketService.off('schedule_cleared', handleScheduleCleared);
    };
  }, []);

  useEffect(() => { applyFilters(); }, [tasks, filters]);

  const loadTasks = async () => {
    try {
      const response = await scheduleAPI.getTasks();
      setTasks([...response.data].sort(compareCode));
    } catch (error) {
      console.error('Ошибка загрузки задач:', error);
    }
  };

  const loadEmployees = async () => {
    try {
      const response = await employeesAPI.getAll({ active_only: true });
      setEmployees(response.data);
    } catch (error) {
      console.error('Ошибка загрузки сотрудников:', error);
    }
  };

  const getBreadcrumb = (task) => {
    if (!task.parent_code) return '';
    const breadcrumbs = [];
    let currentCode = task.parent_code;
    while (currentCode) {
      const parentTask = tasks.find(t => t.code === currentCode);
      if (parentTask) { breadcrumbs.unshift(parentTask.name); currentCode = parentTask.parent_code; }
      else break;
    }
    return breadcrumbs.length > 0 ? breadcrumbs.join(' / ') + ' / ' : '';
  };

  const getChildTasks = (sectionCode, tasksArray) => {
    const children = [];
    const findChildren = (parentCode) => {
      tasksArray.forEach(task => {
        if (task.parent_code === parentCode) {
          if (task.is_section) findChildren(task.code);
          else children.push(task);
        }
      });
    };
    findChildren(sectionCode);
    return children;
  };

  const calculateSectionSum = (section, columnKey) => {
    const childTasks = getChildTasks(section.code, filteredTasks);
    let sum = 0;
    childTasks.forEach(task => {
      switch (columnKey) {
        case 'labor_total':             sum += (task.labor_per_unit || 0) * task.volume_plan; break;
        case 'labor_fact':              sum += (task.labor_per_unit || 0) * task.volume_fact; break;
        case 'labor_remaining':         sum += (task.labor_per_unit || 0) * (task.volume_plan - task.volume_fact); break;
        case 'cost_total':              sum += (task.unit_price || 0) * task.volume_plan; break;
        case 'cost_fact':               sum += (task.unit_price || 0) * task.volume_fact; break;
        case 'cost_remaining':          sum += (task.unit_price || 0) * (task.volume_plan - task.volume_fact); break;
        case 'machine_hours_total':     sum += (task.machine_hours_per_unit || 0) * task.volume_plan; break;
        case 'machine_hours_fact':      sum += (task.machine_hours_per_unit || 0) * task.volume_fact; break;
        case 'machine_hours_remaining': sum += (task.machine_hours_per_unit || 0) * (task.volume_plan - task.volume_fact); break;
        default: break;
      }
    });
    return sum;
  };

  const getDisplayValue = (task, columnKey) => {
    if (task.is_section) {
      const sumColumns = ['labor_total','labor_fact','labor_remaining','cost_total','cost_fact','cost_remaining','machine_hours_total','machine_hours_fact','machine_hours_remaining'];
      if (sumColumns.includes(columnKey)) return calculateSectionSum(task, columnKey).toFixed(2);
      if (['volume_plan','volume_fact','volume_remaining','unit','unit_price','labor_per_unit','machine_hours_per_unit','executor'].includes(columnKey)) return '-';
    }
    switch (columnKey) {
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
      case 'start_date_contract':
      case 'end_date_contract':
      case 'start_date_plan':
      case 'end_date_plan':
        return task[columnKey] ? new Date(task[columnKey]).toLocaleDateString('ru-RU') : '-';
      default:
        return task[columnKey] !== undefined && task[columnKey] !== null ? String(task[columnKey]) : '-';
    }
  };

  const applyFilters = () => {
    let filtered = tasks;
    Object.entries(filters).forEach(([columnKey, filterValue]) => {
      if (filterValue && filterValue.trim() !== '') {
        filtered = filtered.filter(task => {
          const displayValue = getDisplayValue(task, columnKey);
          return displayValue.toLowerCase().includes(filterValue.toLowerCase());
        });
      }
    });
    setFilteredTasks(filtered);
  };

  const handleFilterApply = (columnKey, filterValue) => {
    setFilters(prev => ({ ...prev, [columnKey]: filterValue }));
  };

  const handleClearAllFilters = () => {
    setFilters({});
    setShowFilterManager(false);
  };

  const getColumnValues = (columnKey) => {
    const otherFilters = Object.entries(filters).filter(([key]) => key !== columnKey);
    let tasksForColumn = tasks;
    otherFilters.forEach(([key, filterValue]) => {
      if (filterValue && filterValue.trim() !== '') {
        tasksForColumn = tasksForColumn.filter(task => {
          const dv = getDisplayValue(task, key);
          return dv.toLowerCase().includes(filterValue.toLowerCase());
        });
      }
    });
    return tasksForColumn.map(task => getDisplayValue(task, columnKey));
  };

  const handleCellDoubleClick = (task, columnKey) => {
    if (!isAdmin) return;
    if (!['start_date_plan', 'end_date_plan', 'executor'].includes(columnKey)) return;
    if (task.is_section) return;
    setEditingCell({ taskId: task.id, field: columnKey });
    if (columnKey === 'executor') {
      setEditValue(task[columnKey] || '');
    } else {
      setEditValue(task[columnKey] ? new Date(task[columnKey]).toISOString().split('T')[0] : '');
    }
  };

  const handleCellBlur = async () => {
    if (!editingCell) return;
    const task = tasks.find(t => t.id === editingCell.taskId);
    if (!task) return;
    let currentValue = task[editingCell.field];
    if (['start_date_plan', 'end_date_plan'].includes(editingCell.field)) {
      currentValue = currentValue ? new Date(currentValue).toISOString().split('T')[0] : '';
    } else {
      currentValue = currentValue || '';
    }
    if (editValue === currentValue) { setEditingCell(null); return; }
    try {
      await scheduleAPI.updateTask(editingCell.taskId, { [editingCell.field]: editValue || null });
      setTasks(prev => prev.map(t =>
        t.id === editingCell.taskId ? { ...t, [editingCell.field]: editValue || null } : t
      ));
    } catch (error) {
      console.error('Ошибка обновления поля:', error);
    } finally {
      setEditingCell(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleCellBlur();
    else if (e.key === 'Escape') setEditingCell(null);
  };

  const getCellValue = (task, columnKey) => {
    if (editingCell && editingCell.taskId === task.id && editingCell.field === columnKey) {
      if (columnKey === 'executor') {
        return (
          <select value={editValue} onChange={e => setEditValue(e.target.value)}
            onBlur={handleCellBlur} onKeyDown={handleKeyDown} autoFocus
            style={{ width: '100%', padding: '2px' }}>
            <option value="">Не выбран</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.full_name}>{emp.full_name}</option>
            ))}
          </select>
        );
      }
      return (
        <input type="date" value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={handleCellBlur} onKeyDown={handleKeyDown} autoFocus
          style={{ width: '100%', padding: '2px' }} />
      );
    }
    if (columnKey === 'name') {
      const hasActiveFilters = Object.values(filters).some(f => f && f.trim() !== '');
      const breadcrumb = hasActiveFilters ? getBreadcrumb(task) : '';
      return breadcrumb ? (
        <span>
          <span style={{ color: '#999', fontSize: '0.85em' }}>{breadcrumb}</span>
          {task.name}
        </span>
      ) : task.name;
    }
    return getDisplayValue(task, columnKey);
  };

  const getColumnLabel = (columnKey) => {
    const column = availableColumns.find(col => col.key === columnKey);
    return column ? column.label : columnKey;
  };

  const handleSaveColumnSettings = (newVisibleColumns) => {
    setVisibleColumns(newVisibleColumns);
    localStorage.setItem('scheduleVisibleColumns', JSON.stringify(newVisibleColumns));
  };

  const getRowStyle = (task) => {
    if (!task.is_section) return {};
    return {
      backgroundColor: getSectionColor(task.level),
      fontWeight: 'bold',
      fontSize: task.level === 0 ? '1.02em' : '1em',
    };
  };

  const getCellStyle = (task, columnKey) => {
    if (!isAdmin || task.is_section) return {};
    if (['start_date_plan', 'end_date_plan', 'executor'].includes(columnKey)) {
      return {
        cursor: 'pointer',
        backgroundColor: editingCell?.taskId === task.id && editingCell?.field === columnKey
          ? '#ffffcc' : 'inherit',
      };
    }
    return {};
  };

  // ── Resize разделителя таблица/гант ──
  const handleMouseDown = (e) => { setIsResizing(true); e.preventDefault(); };
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      if (newWidth >= 20 && newWidth <= 85) setTableWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div
      className="schedule-container-integrated"
      ref={containerRef}
      style={{ userSelect: isResizing ? 'none' : 'auto' }}
    >
      <div className="schedule-split-view">
        <div
          className="schedule-table-section"
          style={{ width: showGantt ? `${tableWidth}%` : '100%' }}
          ref={tableScrollRef}
        >
          <div className="table-wrapper">
            <table className="tasks-table-integrated">
              <colgroup>
                {visibleColumns.map(colKey => (
                  <col key={colKey} style={{ width: `${colWidths[colKey] || 100}px` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {visibleColumns.map(columnKey => (
                    <th key={columnKey} style={{ width: `${colWidths[columnKey] || 100}px` }}>
                      <div>{getColumnLabel(columnKey)}</div>
                      <ColumnFilter
                        columnKey={columnKey}
                        columnLabel=""
                        allValues={getColumnValues(columnKey)}
                        currentFilter={filters[columnKey] || ''}
                        onApplyFilter={handleFilterApply}
                      />
                      <div
                        className="col-resize-handle"
                        onMouseDown={(e) => handleColResizeMouseDown(e, columnKey)}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map(task => (
                  <tr key={task.id} style={getRowStyle(task)}>
                    {visibleColumns.map(columnKey => (
                      <td
                        key={columnKey}
                        style={getCellStyle(task, columnKey)}
                        onDoubleClick={() => handleCellDoubleClick(task, columnKey)}
                        title={
                          isAdmin && !task.is_section &&
                          ['start_date_plan', 'end_date_plan', 'executor'].includes(columnKey)
                            ? 'Двойной клик для редактирования' : ''
                        }
                      >
                        {getCellValue(task, columnKey)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showGantt && (
          <div className="resize-divider" onMouseDown={handleMouseDown}>
            <div className="resize-handle"></div>
          </div>
        )}

        {showGantt && (
          <div
            className="schedule-gantt-section"
            style={{ width: `${100 - tableWidth}%` }}
          >
            <GanttChart tasks={filteredTasks} externalScrollRef={ganttBodyRef} />
          </div>
        )}
      </div>

      {showColumnSettings && (
        <ColumnSettings
          availableColumns={availableColumns}
          visibleColumns={visibleColumns}
          onSave={handleSaveColumnSettings}
          onClose={() => setShowColumnSettings(false)}
        />
      )}

      {showFilterManager && (
        <FilterManager
          activeFilters={filters}
          onClearAll={handleClearAllFilters}
          onClose={() => setShowFilterManager(false)}
        />
      )}
    </div>
  );
}

export default Schedule;
