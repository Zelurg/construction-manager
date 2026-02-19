import React, { useState, useEffect, useCallback } from 'react';
import {
  dailyAPI, scheduleAPI, employeesAPI,
  equipmentUsageAPI, brigadesAPI
} from '../services/api';
import websocketService from '../services/websocket';
import ColumnSettings from './ColumnSettings';
import EquipmentUsageModal from './EquipmentUsageModal';
import ExecutorsModal from './ExecutorsModal';
import '../styles/DailyOrders.css';

function DailyOrders({ onShowColumnSettings }) {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  // Бригады со всей статистикой
  const [brigadesStats, setBrigadesStats] = useState([]);

  // Общие данные
  const [tasks, setTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Модалки
  const [showAddWorkModal, setShowAddWorkModal] = useState(false);
  const [addWorkBrigadeId, setAddWorkBrigadeId] = useState(null);
  const [showExecutorsModal, setShowExecutorsModal] = useState(false);
  const [executorsModalBrigadeId, setExecutorsModalBrigadeId] = useState(null);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [equipmentModalBrigadeId, setEquipmentModalBrigadeId] = useState(null);
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  // Форма добавления работы
  const [formData, setFormData] = useState({ task_id: '', volume: '', description: '' });

  const availableColumns = [
    { key: 'code', label: 'Шифр', isBase: true },
    { key: 'name', label: 'Наименование', isBase: true },
    { key: 'unit', label: 'Ед. изм.', isBase: true },
    { key: 'volume', label: 'Объем', isBase: true },
    { key: 'description', label: 'Описание', isBase: true },
    { key: 'executor', label: 'Исполнитель', isBase: false },
    { key: 'unit_price', label: 'Цена за ед.', isBase: false },
    { key: 'labor_per_unit', label: 'Трудозатраты на ед.', isBase: false },
    { key: 'machine_hours_per_unit', label: 'Машиночасы на ед.', isBase: false },
    { key: 'labor_total', label: 'Трудозатраты', isBase: false, isCalculated: true },
    { key: 'cost_total', label: 'Стоимость', isBase: false, isCalculated: true },
    { key: 'machine_hours_total', label: 'Машиночасы', isBase: false, isCalculated: true },
  ];

  const defaultColumns = ['code', 'name', 'unit', 'volume', 'description'];
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('dailyOrdersVisibleColumns');
    return saved ? JSON.parse(saved) : defaultColumns;
  });

  useEffect(() => {
    if (onShowColumnSettings) {
      onShowColumnSettings(() => setShowColumnSettings(true));
    }
  }, [onShowColumnSettings]);

  const loadAll = useCallback(async () => {
    try {
      const [brigRes, tasksRes, empRes] = await Promise.all([
        brigadesAPI.getStats(selectedDate),
        scheduleAPI.getTasks(),
        employeesAPI.getAll({ active_only: true }),
      ]);
      setBrigadesStats(brigRes.data);
      setAllTasks(tasksRes.data);
      setTasks(tasksRes.data.filter(t => !t.is_section));
      setEmployees(empRes.data);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadAll();

    websocketService.connect();

    const reload = () => loadAll();

    websocketService.on('daily_work_created', reload);
    websocketService.on('task_updated', reload);
    websocketService.on('executor_added', reload);
    websocketService.on('executor_updated', reload);
    websocketService.on('executor_deleted', reload);
    websocketService.on('equipment_usage_added', reload);
    websocketService.on('equipment_usage_updated', reload);
    websocketService.on('equipment_usage_deleted', reload);
    websocketService.on('brigade_created', reload);
    websocketService.on('brigade_updated', reload);
    websocketService.on('brigade_deleted', reload);

    return () => {
      websocketService.off('daily_work_created', reload);
      websocketService.off('task_updated', reload);
      websocketService.off('executor_added', reload);
      websocketService.off('executor_updated', reload);
      websocketService.off('executor_deleted', reload);
      websocketService.off('equipment_usage_added', reload);
      websocketService.off('equipment_usage_updated', reload);
      websocketService.off('equipment_usage_deleted', reload);
      websocketService.off('brigade_created', reload);
      websocketService.off('brigade_updated', reload);
      websocketService.off('brigade_deleted', reload);
    };
  }, [loadAll]);

  // --- Добавление бригады ---
  const handleAddBrigade = async () => {
    try {
      const num = brigadesStats.length + 1;
      await brigadesAPI.create({ date: selectedDate, name: `Бригада ${num}` });
      await loadAll();
    } catch (error) {
      console.error('Ошибка создания бригады:', error);
      alert('Ошибка создания бригады');
    }
  };

  // --- Удаление бригады ---
  const handleDeleteBrigade = async (brigadeId, brigadeName) => {
    if (!window.confirm(`Удалить "${brigadeName}"? Работы, исполнители и техника этой бригады останутся в БД, но открепятся от неё.`)) return;
    try {
      await brigadesAPI.delete(brigadeId);
      await loadAll();
    } catch (error) {
      console.error('Ошибка удаления бригады:', error);
      alert('Ошибка удаления бригады');
    }
  };

  // --- Переименование бригады ---
  const handleRenameBrigade = async (brigadeId, currentName) => {
    const newName = window.prompt('Новое название бригады:', currentName);
    if (!newName || newName.trim() === '') return;
    try {
      await brigadesAPI.update(brigadeId, { name: newName.trim() });
      await loadAll();
    } catch (error) {
      console.error('Ошибка переименования:', error);
      alert('Ошибка переименования бригады');
    }
  };

  // --- Добавление работы ---
  const handleOpenAddWork = (brigadeId) => {
    setAddWorkBrigadeId(brigadeId);
    setFormData({ task_id: '', volume: '', description: '' });
    setShowAddWorkModal(true);
  };

  const handleSubmitWork = async (e) => {
    e.preventDefault();
    try {
      await dailyAPI.createWork({
        task_id: parseInt(formData.task_id),
        date: selectedDate,
        volume: parseFloat(formData.volume),
        description: formData.description || null,
        brigade_id: addWorkBrigadeId,
      });
      setShowAddWorkModal(false);
      await loadAll();
    } catch (error) {
      alert('Ошибка при добавлении работы');
      console.error(error);
    }
  };

  const getTaskInfo = (taskId) => tasks.find(t => t.id === taskId);

  const getBreadcrumb = (work) => {
    const task = allTasks.find(t => t.code === work.code);
    if (!task || !task.parent_code) return '';
    const breadcrumbs = [];
    let currentCode = task.parent_code;
    while (currentCode) {
      const parentTask = allTasks.find(t => t.code === currentCode);
      if (parentTask) {
        breadcrumbs.unshift(parentTask.name);
        currentCode = parentTask.parent_code;
      } else break;
    }
    return breadcrumbs.length > 0 ? breadcrumbs.join(' / ') + ' / ' : '';
  };

  const getCellValue = (work, columnKey) => {
    switch (columnKey) {
      case 'name': {
        const breadcrumb = getBreadcrumb(work);
        return breadcrumb ? (
          <span>
            <span style={{ color: '#999', fontSize: '0.85em' }}>{breadcrumb}</span>
            {work.name}
          </span>
        ) : work.name;
      }
      case 'labor_total':
        return work.labor_per_unit != null
          ? (work.volume * (work.labor_per_unit || 0)).toFixed(2)
          : '-';
      case 'cost_total':
        return work.unit_price != null
          ? (work.volume * (work.unit_price || 0)).toFixed(2)
          : '-';
      case 'machine_hours_total':
        return work.machine_hours_per_unit != null
          ? (work.volume * (work.machine_hours_per_unit || 0)).toFixed(2)
          : '-';
      case 'description':
        return work[columnKey] || '-';
      default:
        return work[columnKey] !== undefined && work[columnKey] !== null ? work[columnKey] : '-';
    }
  };

  const getColumnLabel = (key) => {
    const col = availableColumns.find(c => c.key === key);
    return col ? col.label : key;
  };

  const handleSaveColumnSettings = (cols) => {
    setVisibleColumns(cols);
    localStorage.setItem('dailyOrdersVisibleColumns', JSON.stringify(cols));
  };

  const getEfficiencyStatus = (worked, needed) => {
    if (needed == null) return { color: 'gray', label: '' };
    const diff = needed - worked;
    if (Math.abs(diff) < 1) return { color: 'blue', text: needed.toFixed(1), label: 'норма' };
    if (diff > 0) return { color: 'green', text: needed.toFixed(1), label: 'перевыполнение' };
    return { color: 'red', text: needed.toFixed(1), label: 'отставание' };
  };

  return (
    <div className="daily-orders">
      {/* Шапка: выбор даты и кнопка добавить бригаду */}
      <div className="controls-header">
        <div className="date-selector">
          <label>Выберите дату:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
        <button onClick={handleAddBrigade} className="btn-primary">
          + Добавить бригаду
        </button>
      </div>

      {/* Блоки бригад */}
      {brigadesStats.length === 0 ? (
        <div className="no-brigades-hint">
          Нажмите «+ Добавить бригаду», чтобы начать вносить данные за этот день.
        </div>
      ) : (
        brigadesStats.map((bs) => {
          const efEx = getEfficiencyStatus(bs.total_hours_worked, bs.total_labor_hours);
          const efEq = getEfficiencyStatus(bs.total_machine_hours,
            bs.works.reduce((s, w) => s + (w.volume * (w.machine_hours_per_unit || 0)), 0));

          return (
            <div key={bs.brigade.id} className="brigade-block">
              {/* Заголовок бригады */}
              <div className="brigade-header">
                <div className="brigade-title-row">
                  <h3 className="brigade-name">{bs.brigade.name}</h3>
                  <div className="brigade-actions">
                    <button
                      onClick={() => handleRenameBrigade(bs.brigade.id, bs.brigade.name)}
                      className="btn-icon" title="Переименовать"
                    >✏️</button>
                    <button
                      onClick={() => handleDeleteBrigade(bs.brigade.id, bs.brigade.name)}
                      className="btn-icon" title="Удалить бригаду"
                    >🗑️</button>
                  </div>
                </div>

                {/* Статистика бригады */}
                <div className="executors-info">
                  {(bs.executors_count > 0 || bs.responsible) && (
                    <div className="stats-row">
                      {bs.executors_count > 0 && (
                        <>
                          <span>👥 {bs.executors_count} чел.</span>
                          <span>⏱️ {bs.total_hours_worked.toFixed(1)} ч/ч</span>
                          <span style={{ color: efEx.color }}>
                            📊 {efEx.text} ч/ч ({efEx.label})
                          </span>
                        </>
                      )}
                      {bs.responsible && (
                        <span>👨‍💼 Ответственный: {bs.responsible.full_name}</span>
                      )}
                    </div>
                  )}
                  {bs.equipment_count > 0 && (
                    <div className="stats-row">
                      <span>🚜 {bs.equipment_count} ед.</span>
                      <span>⏱️ {bs.total_machine_hours.toFixed(1)} м-ч</span>
                      <span style={{ color: efEq.color }}>
                        📊 {efEq.text} м-ч ({efEq.label})
                      </span>
                    </div>
                  )}
                </div>

                {/* Кнопки управления бригадой */}
                <div className="brigade-controls">
                  <button
                    onClick={() => { setExecutorsModalBrigadeId(bs.brigade.id); setShowExecutorsModal(true); }}
                    className="btn-secondary"
                  >👥 Исполнители</button>
                  <button
                    onClick={() => { setEquipmentModalBrigadeId(bs.brigade.id); setShowEquipmentModal(true); }}
                    className="btn-secondary"
                  >🚜 Техника</button>
                  <button
                    onClick={() => handleOpenAddWork(bs.brigade.id)}
                    className="btn-primary"
                  >+ Внести объём</button>
                </div>
              </div>

              {/* Таблица работ бригады */}
              <div className="table-container">
                <table className="tasks-table">
                  <thead>
                    <tr>
                      {visibleColumns.map(key => (
                        <th key={key}>{getColumnLabel(key)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bs.works.length === 0 ? (
                      <tr>
                        <td colSpan={visibleColumns.length} style={{ textAlign: 'center', padding: '12px', color: '#999' }}>
                          Работы не внесены
                        </td>
                      </tr>
                    ) : (
                      bs.works.map(work => (
                        <tr key={work.id}>
                          {visibleColumns.map(key => (
                            <td key={key}>{getCellValue(work, key)}</td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}

      {/* Модалка добавления работы */}
      {showAddWorkModal && (
        <div className="modal-overlay" onClick={() => setShowAddWorkModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Внести объём работ за {new Date(selectedDate).toLocaleDateString('ru-RU')}</h3>
            <form onSubmit={handleSubmitWork}>
              <div className="form-group">
                <label>Выберите работу *</label>
                <select
                  value={formData.task_id}
                  onChange={(e) => setFormData({ ...formData, task_id: e.target.value })}
                  required
                >
                  <option value="">Выберите...</option>
                  {tasks.map(task => (
                    <option key={task.id} value={task.id}>
                      {task.code} - {task.name} ({task.unit})
                    </option>
                  ))}
                </select>
              </div>

              {formData.task_id && (() => {
                const t = getTaskInfo(parseInt(formData.task_id));
                return t ? (
                  <div className="task-info" style={{
                    background: '#f5f5f5', padding: '10px',
                    borderRadius: '4px', marginBottom: '15px', fontSize: '14px'
                  }}>
                    <strong>Информация о задаче:</strong><br />
                    План: {t.volume_plan} {t.unit}<br />
                    Факт: {t.volume_fact} {t.unit}<br />
                    Осталось: {(t.volume_plan - t.volume_fact).toFixed(2)} {t.unit}
                  </div>
                ) : null;
              })()}

              <div className="form-group">
                <label>Объем выполненных работ *</label>
                <input
                  type="number" step="0.01"
                  value={formData.volume}
                  onChange={(e) => setFormData({ ...formData, volume: e.target.value })}
                  placeholder="Введите объём"
                  required
                />
              </div>

              <div className="form-group">
                <label>Описание (необязательно)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Комментарий к выполненным работам"
                  rows="3"
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowAddWorkModal(false)} className="btn-cancel">Отмена</button>
                <button type="submit" className="btn-submit">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка исполнителей */}
      {showExecutorsModal && (
        <ExecutorsModal
          date={selectedDate}
          employees={employees}
          brigadeId={executorsModalBrigadeId}
          onClose={() => setShowExecutorsModal(false)}
          onUpdate={loadAll}
        />
      )}

      {/* Модалка техники */}
      {showEquipmentModal && (
        <EquipmentUsageModal
          date={selectedDate}
          brigadeId={equipmentModalBrigadeId}
          onClose={() => setShowEquipmentModal(false)}
          onUpdate={loadAll}
        />
      )}

      {/* Настройки колонок */}
      {showColumnSettings && (
        <ColumnSettings
          availableColumns={availableColumns}
          visibleColumns={visibleColumns}
          onSave={handleSaveColumnSettings}
          onClose={() => setShowColumnSettings(false)}
        />
      )}
    </div>
  );
}

export default DailyOrders;
