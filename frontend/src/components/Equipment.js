import React, { useState, useEffect } from 'react';
import { equipmentAPI } from '../services/api';
import '../styles/Equipment.css';

/**
 * Компонент для управления справочником техники
 */
function Equipment() {
  const [equipment, setEquipment] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [formData, setFormData] = useState({
    equipment_type: '',
    model: '',
    registration_number: '',
    is_active: true
  });
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadEquipment();
  }, [showInactive]);

  const loadEquipment = async () => {
    try {
      setLoading(true);
      const response = await equipmentAPI.getAll({ active_only: !showInactive });
      setEquipment(response.data);
    } catch (error) {
      console.error('Ошибка загрузки техники:', error);
      alert('Ошибка загрузки техники');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingEquipment(null);
    setFormData({
      equipment_type: '',
      model: '',
      registration_number: '',
      is_active: true
    });
    setShowModal(true);
  };

  const handleEdit = (eq) => {
    setEditingEquipment(eq);
    setFormData({
      equipment_type: eq.equipment_type,
      model: eq.model,
      registration_number: eq.registration_number,
      is_active: eq.is_active
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingEquipment) {
        await equipmentAPI.update(editingEquipment.id, formData);
      } else {
        await equipmentAPI.create(formData);
      }

      setShowModal(false);
      await loadEquipment();
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка сохранения техники';
      alert(errorMessage);
    }
  };

  const handleDelete = async (eq) => {
    if (!window.confirm(`Удалить технику "${eq.equipment_type} ${eq.model} (${eq.registration_number})"?\n\nВНИМАНИЕ: Это возможно только если у техники нет связанных записей об использовании.`)) {
      return;
    }

    try {
      await equipmentAPI.delete(eq.id);
      await loadEquipment();
    } catch (error) {
      console.error('Ошибка удаления:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка удаления техники';
      alert(errorMessage);
    }
  };

  const handleToggleActive = async (eq) => {
    try {
      if (eq.is_active) {
        await equipmentAPI.deactivate(eq.id);
      } else {
        await equipmentAPI.activate(eq.id);
      }
      await loadEquipment();
    } catch (error) {
      console.error('Ошибка изменения статуса:', error);
      alert('Ошибка изменения статуса техники');
    }
  };

  return (
    <div className="equipment">
      <div className="equipment-header">
        <div className="header-left">
          <h3>Справочник техники</h3>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Показать неактивную
          </label>
        </div>
        <button onClick={handleAdd} className="btn-primary">
          + Добавить технику
        </button>
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <div className="table-container">
          <table className="equipment-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Вид техники</th>
                <th>Модель</th>
                <th>Гос. номер</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {equipment.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>
                    Техники нет. Добавьте первую технику.
                  </td>
                </tr>
              ) : (
                equipment.map((eq, index) => (
                  <tr key={eq.id} className={!eq.is_active ? 'inactive-row' : ''}>
                    <td>{index + 1}</td>
                    <td>{eq.equipment_type}</td>
                    <td>{eq.model}</td>
                    <td>{eq.registration_number}</td>
                    <td>
                      <span className={`status-badge ${eq.is_active ? 'active' : 'inactive'}`}>
                        {eq.is_active ? 'Активна' : 'Неактивна'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          onClick={() => handleEdit(eq)}
                          className="btn-edit"
                          title="Редактировать"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleToggleActive(eq)}
                          className={eq.is_active ? 'btn-deactivate' : 'btn-activate'}
                          title={eq.is_active ? 'Деактивировать' : 'Активировать'}
                        >
                          {eq.is_active ? '🚫' : '✅'}
                        </button>
                        <button
                          onClick={() => handleDelete(eq)}
                          className="btn-delete"
                          title="Удалить"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Модальное окно для добавления/редактирования */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{editingEquipment ? 'Редактирование техники' : 'Добавление техники'}</h3>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Вид техники *</label>
                <input
                  type="text"
                  value={formData.equipment_type}
                  onChange={(e) => setFormData({ ...formData, equipment_type: e.target.value })}
                  placeholder="Экскаватор, Кран, Бульдозер..."
                  required
                />
              </div>

              <div className="form-group">
                <label>Модель *</label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="Caterpillar 320D, Liebherr LTM 1050..."
                  required
                />
              </div>

              <div className="form-group">
                <label>Гос. номер *</label>
                <input
                  type="text"
                  value={formData.registration_number}
                  onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
                  placeholder="А1234МК"
                  required
                />
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  Активна
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowModal(false)} className="btn-cancel">
                  Отмена
                </button>
                <button type="submit" className="btn-submit">
                  {editingEquipment ? 'Сохранить' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Equipment;
