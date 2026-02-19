import React, { useEffect, useState } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { projectsAPI } from '../services/api';
import '../styles/ProjectSelect.css';

/**
 * Экран выбора объекта.
 * Показывается сразу после логина (или при нажатии «Сменить объект»).
 * onSelect(project) — колбэк в App.js, переключает на рабочее пространство.
 */
function ProjectSelect({ user, onLogout, onSelect }) {
  const { setCurrentProject } = useProject();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Для формы создания нового объекта (только admin)
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', address: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await projectsAPI.getAll(user?.role === 'admin');
      setProjects(res.data);
    } catch (e) {
      setError('Не удалось загрузить объекты');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSelect = (project) => {
    setCurrentProject(project);
    onSelect(project);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    try {
      setSaving(true);
      await projectsAPI.create(formData);
      setFormData({ name: '', description: '', address: '' });
      setShowForm(false);
      load();
    } catch (e) {
      alert('Ошибка создания объекта: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (project, e) => {
    e.stopPropagation(); // не переходим в объект
    const action = project.is_archived ? 'разархивировать' : 'архивировать';
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} объект «${project.name}»?`)) return;
    try {
      await projectsAPI.update(project.id, { is_archived: !project.is_archived });
      load();
    } catch (e) {
      alert('Ошибка: ' + (e.response?.data?.detail || e.message));
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="project-select-page">
      <div className="project-select-header">
        <div className="project-select-logo">
          <span className="logo-icon">🏗</span>
          <span className="logo-text">Управление строительными проектами</span>
        </div>
        <div className="project-select-user">
          <span className="user-name">{user?.full_name}</span>
          <span className="user-role">({user?.role})</span>
          <button className="btn-logout" onClick={onLogout}>Выйти</button>
        </div>
      </div>

      <div className="project-select-body">
        <div className="project-select-title-row">
          <h2>Выберите объект</h2>
          {user?.role === 'admin' && (
            <button className="btn-add-project" onClick={() => setShowForm(!showForm)}>
              {showForm ? '✕ Отмена' : '+ Новый объект'}
            </button>
          )}
        </div>

        {showForm && (
          <form className="project-create-form" onSubmit={handleCreate}>
            <input
              type="text" placeholder="Название объекта *" required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            <input
              type="text" placeholder="Адрес"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
            <textarea
              placeholder="Описание"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
            <button type="submit" disabled={saving}>
              {saving ? 'Создание...' : 'Создать объект'}
            </button>
          </form>
        )}

        {loading && <div className="project-loading">Загрузка объектов...</div>}
        {error && <div className="project-error">{error}</div>}

        {!loading && projects.length === 0 && (
          <div className="project-empty">
            <p>Нет доступных объектов.</p>
            {user?.role === 'admin' && <p>Создайте первый объект с помощью кнопки выше.</p>}
          </div>
        )}

        <div className="projects-grid">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`project-card ${ project.is_archived ? 'archived' : '' }`}
              onClick={() => !project.is_archived && handleSelect(project)}
            >
              <div className="project-card-header">
                <h3 className="project-card-name">{project.name}</h3>
                {project.is_archived && <span className="project-archive-badge">Архив</span>}
              </div>

              {project.address && (
                <p className="project-card-address">📍 {project.address}</p>
              )}
              {project.description && (
                <p className="project-card-desc">{project.description}</p>
              )}

              <div className="project-card-footer">
                <span className="project-card-updated">
                  🕐 Обновлён: {formatDate(project.updated_at)}
                </span>

                {user?.role === 'admin' && (
                  <button
                    className={`btn-archive ${ project.is_archived ? 'btn-unarchive' : '' }`}
                    onClick={(e) => handleArchive(project, e)}
                  >
                    {project.is_archived ? '↩ Разархивировать' : '📦 В архив'}
                  </button>
                )}
              </div>

              {project.is_archived && (
                <div className="project-card-archived-overlay">
                  <span>Архивный объект</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ProjectSelect;
