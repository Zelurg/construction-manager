import React, { useEffect, useMemo, useState } from 'react';
import { executorsAPI } from '../services/api';
import '../styles/ExecutorsModal.css';

function ExecutorsModal({ date, employees = [], brigadeId, onClose, onUpdate }) {
  const [loading, setLoading] = useState(true);
  const [executors, setExecutors] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [hoursWorked, setHoursWorked] = useState(10.0);
  const [responsibleId, setResponsibleId] = useState('');

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, brigadeId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const statsResponse = await executorsAPI.getStats(date, brigadeId);
      const list = statsResponse.data?.executors || [];
      setExecutors(list);
      const responsibleExec = list.find(e => e.is_responsible);
      setResponsibleId(responsibleExec ? responsibleExec.employee_id.toString() : '');
    } catch (error) {
      console.error('Ошибка загрузки исполнителей:', error);
      alert('Ошибка загрузки исполнителей');
    } finally {
      setLoading(false);
    }
  };

  const responsibleEmployeeIdNum = responsibleId ? parseInt(responsibleId) : null;

  const usedEmployeeIds = useMemo(
    () => executors.filter(e => !e.is_responsible).map(e => e.employee_id),
    [executors]
  );

  const availableEmployees = useMemo(
    () => (employees || [])
      .filter(emp => emp.id !== responsibleEmployeeIdNum)
      .filter(emp => !usedEmployeeIds.includes(emp.id)),
    [employees, responsibleEmployeeIdNum, usedEmployeeIds]
  );

  const nonResponsibleExecutors = useMemo(
    () => executors.filter(e => !e.is_responsible),
    [executors]
  );

  const getEmployeeLabel = (empId) => {
    const emp = (employees || []).find(e => e.id === empId);
    return emp ? `${emp.full_name}${emp.position ? ' — ' + emp.position : ''}` : `ID: ${empId}`;
  };

  const handleSetResponsible = async () => {
    try {
      const old = executors.find(e => e.is_responsible);
      if (old) await executorsAPI.delete(old.id);
      if (responsibleId) {
        await executorsAPI.create({
          date,
          employee_id: parseInt(responsibleId),
          hours_worked: 10.0,
          is_responsible: true,
          brigade_id: brigadeId,
        });
      }
      await loadData();
      onUpdate && onUpdate();
    } catch (error) {
      console.error('Ошибка сохранения ответственного:', error);
      alert(error.response?.data?.detail || 'Ошибка сохранения ответственного');
    }
  };

  const handleAdd = async () => {
    if (!selectedEmployeeId) { alert('Выберите исполнителя'); return; }
    const h = parseFloat(hoursWorked);
    if (!(h > 0) || h > 24) { alert('Часы должны быть от 0 до 24'); return; }
    try {
      await executorsAPI.create({
        date,
        employee_id: parseInt(selectedEmployeeId),
        hours_worked: h,
        is_responsible: false,
        brigade_id: brigadeId,
      });
      await loadData();
      onUpdate && onUpdate();
      setSelectedEmployeeId('');
      setHoursWorked(10.0);
    } catch (error) {
      alert(error.response?.data?.detail || 'Ошибка добавления исполнителя');
    }
  };

  const handleDelete = async (executorId) => {
    if (!window.confirm('Удалить исполнителя из дня?')) return;
    try {
      await executorsAPI.delete(executorId);
      await loadData();
      onUpdate && onUpdate();
    } catch (error) {
      alert('Ошибка удаления исполнителя');
    }
  };

  const handleUpdateHours = async (executorId, newHours) => {
    const h = parseFloat(newHours);
    if (!(h > 0) || h > 24) { alert('Часы должны быть от 0 до 24'); return; }
    try {
      await executorsAPI.update(executorId, { hours_worked: h });
      await loadData();
      onUpdate && onUpdate();
    } catch (error) {
      alert('Ошибка обновления часов');
    }
  };

  const totalHours = nonResponsibleExecutors.reduce((s, e) => s + (e.hours_worked || 0), 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content executors-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Исполнители на {new Date(date).toLocaleDateString('ru-RU')}</h3>
          <button onClick={onClose} className="close-button">&times;</button>
        </div>

        {loading ? (
          <div className="loading">Загрузка...</div>
        ) : (
          <>
            <div className="add-form">
              <h4>Ответственный (прораб)</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Сотрудник</label>
                  <select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
                    <option value="">Не указан</option>
                    {(employees || []).map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} - {emp.position}
                      </option>
                    ))}
                  </select>
                </div>
                <button onClick={handleSetResponsible} className="btn-add">💾 Сохранить</button>
              </div>
            </div>

            <div className="add-form">
              <h4>Добавить исполнителя</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Исполнитель</label>
                  <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}>
                    <option value="">Выберите исполнителя</option>
                    {availableEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} - {emp.position}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Часы</label>
                  <input
                    type="number" value={hoursWorked}
                    onChange={(e) => setHoursWorked(e.target.value)}
                    min="0.1" max="24" step="0.5" className="hours-input"
                  />
                </div>
                <button onClick={handleAdd} className="btn-add">+ Добавить</button>
              </div>
            </div>

            <div className="list-container">
              <h4>Исполнители на этот день</h4>
              {nonResponsibleExecutors.length === 0 ? (
                <p className="no-data">Исполнители не добавлены</p>
              ) : (
                <table className="usage-table">
                  <thead>
                    <tr><th>№</th><th>Сотрудник</th><th>Часы</th><th>Действия</th></tr>
                  </thead>
                  <tbody>
                    {nonResponsibleExecutors.map((e, i) => (
                      <tr key={e.id}>
                        <td>{i + 1}</td>
                        <td>{getEmployeeLabel(e.employee_id)}</td>
                        <td>
                          <input
                            type="number" value={e.hours_worked}
                            onChange={(ev) => handleUpdateHours(e.id, ev.target.value)}
                            min="0.1" max="24" step="0.5" className="hours-input"
                          />
                        </td>
                        <td>
                          <button onClick={() => handleDelete(e.id)} className="btn-delete-small" title="Удалить">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold' }}>Итого:</td>
                      <td style={{ fontWeight: 'bold' }}>{totalHours.toFixed(1)} ч</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ExecutorsModal;
