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

  // Редактирование карточки объекта (только admin)
  const [editingProject, setEditingProject] = useState(null);
  const [editData, setEditData] = useState({ name: '', description: '', address: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Режим отображения: 'cards' | 'list'
  const [viewMode, setViewMode] = useState('cards');

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

  const handleDelete = async (project, e) => {
    e.stopPropagation();
    const confirmMsg =
      `ПОЛНОСТЬЮ удалить объект «${project.name}»?\n\n` +
      `Будут безвозвратно удалены все связанные данные: работы, бригады, ` +
      `дневные объёмы, исполнители, техника и комментарии.\nЭто действие нельзя отменить.`;
    if (!window.confirm(confirmMsg)) return;
    if (!window.confirm('Точно удалить? Действие необратимо.')) return;
    try {
      await projectsAPI.remove(project.id);
      load();
    } catch (e) {
      alert('Ошибка удаления: ' + (e.response?.data?.detail || e.message));
    }
  };

  const openEdit = (project, e) => {
    e.stopPropagation();
    setEditData({
      name: project.name,
      description: project.description || '',
      address: project.address || '',
    });
    setEditingProject(project);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editingProject) return;
    if (!editData.name.trim()) return;
    try {
      setSavingEdit(true);
      await projectsAPI.update(editingProject.id, {
        name: editData.name,
        description: editData.description,
        address: editData.address,
      });
      setEditingProject(null);
      load();
    } catch (err) {
      alert('Ошибка сохранения: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingEdit(false);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    // Бэкенд хранит naive-UTC (datetime.utcnow) без маркера зоны.
    // Добавляем 'Z', чтобы JS интерпретировал его как UTC и перевёл в локальное время.
    let str = iso;
    const hasTz = /(Z|[+-]\d{2}:?\d{2})$/.test(str);
    if (!hasTz) str = str.replace(/\.\d+$/, '') + 'Z';
    const d = new Date(str);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('ru-RU', {
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
          <div className="project-select-actions">
            <div className="project-view-toggle">
              <button
                className={`view-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
                onClick={() => setViewMode('cards')}
                title="Карточки"
              >▦</button>
              <button
                className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="Список"
              >☰</button>
            </div>
            {user?.role === 'admin' && (
              <button className="btn-add-project" onClick={() => setShowForm(!showForm)}>
                {showForm ? '✕ Отмена' : '+ Новый объект'}
              </button>
            )}
          </div>
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

        {viewMode === 'cards' && (
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
                    <div className="project-card-actions">
                      <button className="btn-edit" onClick={(e) => openEdit(project, e)} title="Редактировать">✎</button>
                      <button className="btn-delete" onClick={(e) => handleDelete(project, e)} title="Удалить">🗑</button>
                      <button
                        className={`btn-archive ${ project.is_archived ? 'btn-unarchive' : '' }`}
                        onClick={(e) => handleArchive(project, e)}
                      >
                        {project.is_archived ? '↩ Восстановить' : '📦 В архив'}
                      </button>
                    </div>
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
        )}

        {viewMode === 'list' && (
          <div className="projects-list">
            <div className="projects-list-head">
              <span className="col-name">Название</span>
              <span className="col-address">Адрес</span>
              <span className="col-desc">Описание</span>
              <span className="col-updated">Обновлён</span>
              {user?.role === 'admin' && <span className="col-actions">Действия</span>}
            </div>
            {projects.map((project) => (
              <div
                key={project.id}
                className={`projects-list-row ${ project.is_archived ? 'archived' : '' }`}
                onClick={() => !project.is_archived && handleSelect(project)}
                title={project.is_archived ? undefined : 'Открыть объект'}
              >
                <span className="col-name">
                  {project.name}
                  {project.is_archived && <span className="project-archive-badge list-badge">Архив</span>}
                </span>
                <span className="col-address">{project.address || '—'}</span>
                <span className="col-desc">{project.description || '—'}</span>
                <span className="col-updated">{formatDate(project.updated_at)}</span>
                {user?.role === 'admin' && (
                  <span className="col-actions">
                    <button className="btn-edit" onClick={(e) => openEdit(project, e)} title="Редактировать">✎</button>
                    <button className="btn-delete" onClick={(e) => handleDelete(project, e)} title="Удалить">🗑</button>
                    <button
                      className={`btn-archive ${ project.is_archived ? 'btn-unarchive' : '' }`}
                      onClick={(e) => handleArchive(project, e)}
                    >
                      {project.is_archived ? '↩ Восстановить' : '📦 В архив'}
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {editingProject && (
        <div className="project-modal-overlay" onClick={() => setEditingProject(null)}>
          <div className="project-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="project-modal-header">
              <h3>Редактировать объект</h3>
              <button className="project-modal-close" onClick={() => setEditingProject(null)}>✕</button>
            </div>
            <form className="project-create-form" onSubmit={handleEditSave}>
              <input
                type="text" placeholder="Название объекта *" required
                value={editData.name}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
              />
              <input
                type="text" placeholder="Адрес"
                value={editData.address}
                onChange={(e) => setEditData({ ...editData, address: e.target.value })}
              />
              <textarea
                placeholder="Описание"
                value={editData.description}
                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              />
              <div className="project-modal-buttons">
                <button type="button" className="btn-cancel" onClick={() => setEditingProject(null)}>Отмена</button>
                <button type="submit" className="btn-save" disabled={savingEdit}>
                  {savingEdit ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectSelect;
