import React, { useState, useEffect } from 'react';
import authService from '../services/authService';
import '../styles/AdminPanel.css';

function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
    role: 'viewer'
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await authService.getAllUsers();
      setUsers(data);
      setError('');
    } catch (err) {
      setError('Ошибка загрузки пользователей');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      email: '',
      full_name: '',
      password: '',
      role: 'viewer'
    });
    setShowModal(true);
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      password: '',
      role: user.role
    });
    setShowModal(true);
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Вы уверены, что хотите удалить этого пользователя?')) {
      return;
    }

    try {
      await authService.deleteUser(userId);
      await loadUsers();
    } catch (err) {
      alert('Ошибка при удалении пользователя');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingUser) {
        // Обновление
        const updateData = {
          email: formData.email,
          full_name: formData.full_name,
          role: formData.role
        };
        if (formData.password) {
          updateData.password = formData.password;
        }
        await authService.updateUser(editingUser.id, updateData);
      } else {
        // Создание
        await authService.createUser(formData);
      }
      
      setShowModal(false);
      await loadUsers();
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка при сохранении');
    }
  };

  const getRoleName = (role) => {
    const roles = {
      admin: 'Администратор',
      user: 'Пользователь',
      viewer: 'Наблюдатель'
    };
    return roles[role] || role;
  };

  if (loading) {
    return <div className="admin-panel"><p>Загрузка...</p></div>;
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2>Управление пользователями</h2>
        <button onClick={handleCreate} className="btn-primary">
          + Добавить пользователя
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <table className="users-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Имя пользователя</th>
            <th>Email</th>
            <th>Полное имя</th>
            <th>Роль</th>
            <th>Дата создания</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td>{user.id}</td>
              <td>{user.username}</td>
              <td>{user.email}</td>
              <td>{user.full_name}</td>
              <td>
                <span className={`role-badge role-${user.role}`}>
                  {getRoleName(user.role)}
                </span>
              </td>
              <td>{new Date(user.created_at).toLocaleDateString('ru-RU')}</td>
              <td>
                <button 
                  onClick={() => handleEdit(user)} 
                  className="btn-edit"
                >
                  Изменить
                </button>
                <button 
                  onClick={() => handleDelete(user.id)} 
                  className="btn-delete"
                >
                  Удалить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{editingUser ? 'Редактировать пользователя' : 'Создать пользователя'}</h3>
            
            <form onSubmit={handleSubmit}>
              {!editingUser && (
                <div className="form-group">
                  <label>Имя пользователя *</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  required
                />
              </div>

              <div className="form-group">
                <label>Полное имя *</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                  required
                />
              </div>

              <div className="form-group">
                <label>Пароль {editingUser ? '(оставьте пустым, чтобы не менять)' : '*'}</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  required={!editingUser}
                />
              </div>

              <div className="form-group">
                <label>Роль *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                  required
                >
                  <option value="viewer">Наблюдатель</option>
                  <option value="user">Пользователь</option>
                  <option value="admin">Администратор</option>
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowModal(false)} className="btn-cancel">
                  Отмена
                </button>
                <button type="submit" className="btn-submit">
                  {editingUser ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
