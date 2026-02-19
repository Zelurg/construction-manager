import React, { useState, useEffect } from 'react';
import { equipmentAPI, equipmentUsageAPI } from '../services/api';
import '../styles/ExecutorsModal.css';

function EquipmentUsageModal({ date, brigadeId, onClose, onUpdate }) {
  const [equipment, setEquipment] = useState([]);
  const [usage, setUsage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');
  const [machineHours, setMachineHours] = useState(8.0);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, brigadeId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const equipmentResponse = await equipmentAPI.getAll({ active_only: true });
      setEquipment(equipmentResponse.data);

      // Загружаем статистику с фильтром по бригаде
      const statsResponse = await equipmentUsageAPI.getStats(date, brigadeId);
      setUsage(statsResponse.data?.equipment_usage || []);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      alert('Ошибка загрузки данных о технике');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!selectedEquipmentId) {
      alert('Выберите технику');
      return;
    }
    if (machineHours <= 0 || machineHours > 24) {
      alert('Машиночасы должны быть от 0 до 24');
      return;
    }
    try {
      await equipmentUsageAPI.create({
        date,
        equipment_id: parseInt(selectedEquipmentId),
        machine_hours: parseFloat(machineHours),
        brigade_id: brigadeId ?? null,  // Передаём brigade_id
      });
      await loadData();
      onUpdate && onUpdate();
      setSelectedEquipmentId('');
      setMachineHours(8.0);
    } catch (error) {
      console.error('Ошибка добавления:', error);
      alert(error.response?.data?.detail || 'Ошибка добавления техники');
    }
  };

  const handleDelete = async (usageId) => {
    if (!window.confirm('Удалить эту технику из дня?')) return;
    try {
      await equipmentUsageAPI.delete(usageId);
      await loadData();
      onUpdate && onUpdate();
    } catch (error) {
      console.error('Ошибка удаления:', error);
      alert('Ошибка удаления техники');
    }
  };

  const handleUpdateMachineHours = async (usageId, newHours) => {
    if (newHours <= 0 || newHours > 24) {
      alert('Машиночасы должны быть от 0 до 24');
      return;
    }
    try {
      await equipmentUsageAPI.update(usageId, { machine_hours: parseFloat(newHours) });
      await loadData();
      onUpdate && onUpdate();
    } catch (error) {
      console.error('Ошибка обновления:', error);
      alert('Ошибка обновления машиночасов');
    }
  };

  const usedEquipmentIds = usage.map(u => u.equipment_id);
  const availableEquipment = equipment.filter(e => !usedEquipmentIds.includes(e.id));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content executors-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Техника на {new Date(date).toLocaleDateString('ru-RU')}</h3>
          <button onClick={onClose} className="close-button">&times;</button>
        </div>

        {loading ? (
          <div className="loading">Загрузка...</div>
        ) : (
          <>
            <div className="add-form">
              <h4>Добавить технику</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Техника</label>
                  <select
                    value={selectedEquipmentId}
                    onChange={(e) => setSelectedEquipmentId(e.target.value)}
                  >
                    <option value="">Выберите технику</option>
                    {availableEquipment.map(eq => (
                      <option key={eq.id} value={eq.id}>
                        {eq.equipment_type} {eq.model} ({eq.registration_number})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Машиночасы</label>
                  <input
                    type="number"
                    value={machineHours}
                    onChange={(e) => setMachineHours(e.target.value)}
                    min="0.1" max="24" step="0.5"
                  />
                </div>
                <button onClick={handleAdd} className="btn-add">+ Добавить</button>
              </div>
            </div>

            <div className="list-container">
              <h4>Техника на этот день</h4>
              {usage.length === 0 ? (
                <p className="no-data">Техника не добавлена</p>
              ) : (
                <table className="usage-table">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Вид</th>
                      <th>Модель</th>
                      <th>Гос. номер</th>
                      <th>Машиночасы</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.map((u, index) => (
                      <tr key={u.id}>
                        <td>{index + 1}</td>
                        <td>{u.equipment.equipment_type}</td>
                        <td>{u.equipment.model}</td>
                        <td>{u.equipment.registration_number}</td>
                        <td>
                          <input
                            type="number"
                            value={u.machine_hours}
                            onChange={(e) => handleUpdateMachineHours(u.id, e.target.value)}
                            min="0.1" max="24" step="0.5"
                            className="hours-input"
                          />
                        </td>
                        <td>
                          <button
                            onClick={() => handleDelete(u.id)}
                            className="btn-delete-small"
                            title="Удалить"
                          >🗑️</button>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'right', fontWeight: 'bold' }}>Итого:</td>
                      <td style={{ fontWeight: 'bold' }}>
                        {usage.reduce((sum, u) => sum + u.machine_hours, 0).toFixed(1)} м-ч
                      </td>
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

export default EquipmentUsageModal;
