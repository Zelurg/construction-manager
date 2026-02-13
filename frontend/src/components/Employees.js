import React, { useState, useEffect } from 'react';
import { employeesAPI } from '../services/api';
import '../styles/Employees.css';

/**
 * Компонент для управления справочником сотрудников
 */
function Employees() {
  const [employees, setEmployees] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '',
    position: '',
    is_active: true
  });
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, [showInactive]);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const response = await employeesAPI.getAll({ active_only: !showInactive });
      setEmployees(response.data);
    } catch (error) {
      console.error('Ошибка загрузки сотрудников:', error);
      alert('Ошибка загрузки сотрудников');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingEmployee(null);
    setFormData({
      full_name: '',
      position: '',
      is_active: true
    });
    setShowModal(true);
  };

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    setFormData({
      full_name: employee.full_name,
      position: employee.position,
      is_active: employee.is_active
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingEmployee) {
        await employeesAPI.update(editingEmployee.id, formData);
      } else {
        await employeesAPI.create(formData);
      }

      setShowModal(false);
      await loadEmployees();
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка сохранения сотрудника';
      alert(errorMessage);
    }
  };

  const handleDelete = async (employee) => {
    if (!window.confirm(`Удалить сотрудника "${employee.full_name}"?\n\nВНИМАНИЕ: Это возможно только если у сотрудника нет связанных записей о работах.`)) {
      return;
    }

    try {
      await employeesAPI.delete(employee.id);
      await loadEmployees();
    } catch (error) {
      console.error('Ошибка удаления:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка удаления сотрудника';
      alert(errorMessage);
    }
  };

  const handleToggleActive = async (employee) => {
    try {
      if (employee.is_active) {
        await employeesAPI.deactivate(employee.id);
      } else {
        await employeesAPI.activate(employee.id);
      }
      await loadEmployees();
    } catch (error) {
      console.error('Ошибка изменения статуса:', error);
      alert('Ошибка изменения статуса сотрудника');
    }
  };

  return (
    <div className="employees">
      <div className="employees-header">
        <div className="header-left">
          <h3>Справочник сотрудников</h3>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Показать неактивных
          </label>
        </div>
        <button onClick={handleAdd} className="btn-primary">
          + Добавить сотрудника
        </button>
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <div className="table-container">
          <table className="employees-table">
            <thead>
              <tr>
                <th>№</th>
                <th>ФИО</th>
                <th>Профессия/Должность</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>
                    Сотрудников нет. Добавьте первого сотрудника.
                  </td>
                </tr>
              ) : (
                employees.map((employee, index) => (
                  <tr key={employee.id} className={!employee.is_active ? 'inactive-row' : ''}>
                    <td>{index + 1}</td>
                    <td>{employee.full_name}</td>
                    <td>{employee.position}</td>
                    <td>
                      <span className={`status-badge ${employee.is_active ? 'active' : 'inactive'}`}>
                        {employee.is_active ? 'Активен' : 'Неактивен'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          onClick={() => handleEdit(employee)}
                          className="btn-edit"
                          title="Редактировать"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleToggleActive(employee)}
                          className={employee.is_active ? 'btn-deactivate' : 'btn-activate'}
                          title={employee.is_active ? 'Деактивировать' : 'Активировать'}
                        >
                          {employee.is_active ? '🚫' : '✅'}
                        </button>
                        <button
                          onClick={() => handleDelete(employee)}
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
            <h3>{editingEmployee ? 'Редактирование сотрудника' : 'Добавление сотрудника'}</h3>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>ФИО *</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Иванов Иван Иванович"
                  required
                />
              </div>

              <div className="form-group">
                <label>Профессия/Должность *</label>
                <input
                  type="text"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  placeholder="Монтажник, Сварщик, Прораб..."
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
                  Активен
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowModal(false)} className="btn-cancel">
                  Отмена
                </button>
                <button type="submit" className="btn-submit">
                  {editingEmployee ? 'Сохранить' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Employees;
