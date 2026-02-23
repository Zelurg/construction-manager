import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Schedule from './components/Schedule';
import MonthlyOrder from './components/MonthlyOrder';
import DailyOrders from './components/DailyOrders';
import Analytics from './components/Analytics';
import Directories from './components/Directories';
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';
import Toolbar from './components/Toolbar';
import ProjectSelect from './components/ProjectSelect';
import { ProjectProvider, useProject } from './contexts/ProjectContext';
import authService from './services/authService';
import { importExportAPI } from './services/api';
import './styles/Toolbar.css';
import './styles/GanttChart.css';

const VALID_TABS = ['schedule', 'monthly', 'daily', 'analytics', 'directories', 'admin'];

function AppInner() {
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('activeTab');
    return saved && VALID_TABS.includes(saved) ? saved : 'schedule';
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showGantt, setShowGantt] = useState(true);
  const { currentProject, setCurrentProject, clearProject } = useProject();

  const columnSettingsHandlers = useRef({ schedule: null, monthly: null, daily: null });
  const filtersHandlers = useRef({ schedule: null, monthly: null });
  const scheduleKey = useRef(0);

  useEffect(() => {
    const token = authService.getToken();
    const currentUser = authService.getCurrentUser();
    if (token && currentUser) {
      setIsAuthenticated(true);
      setUser(currentUser);
    }
    setLoading(false);
  }, []);

  // Сохраняем выбранную вкладку при каждом изменении
  const handleSetActiveTab = (tab) => {
    setActiveTab(tab);
    localStorage.setItem('activeTab', tab);
  };

  const handleLoginSuccess = () => {
    const currentUser = authService.getCurrentUser();
    setIsAuthenticated(true);
    setUser(currentUser);
    clearProject();
  };

  const handleLogout = () => {
    authService.logout();
    clearProject();
    setIsAuthenticated(false);
    setUser(null);
  };

  const handleProjectSelect = (project) => {
    setCurrentProject(project);
    // При смене объекта возвращаемся на График
    handleSetActiveTab('schedule');
    scheduleKey.current += 1;
  };

  const handleSwitchProject = () => {
    clearProject();
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await importExportAPI.exportTasks();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `export_${currentProject?.name || 'schedule'}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Ошибка скачивания: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleUploadTemplate = async (file) => {
    try {
      const response = await importExportAPI.uploadTemplate(file);
      alert(
        `Успешно обработано задач: ${response.data.tasks_processed}\n` +
        (response.data.errors.length > 0 ? `Ошибки:\n${response.data.errors.join('\n')}` : '')
      );
      window.location.reload();
    } catch (error) {
      alert('Ошибка загрузки файла: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleShowColumnSettings = () => {
    const handler = columnSettingsHandlers.current[activeTab];
    if (handler) handler();
  };

  const handleShowFilters = () => {
    const handler = filtersHandlers.current[activeTab];
    if (handler) handler();
  };

  const handleScheduleCleared = () => { scheduleKey.current += 1; };

  if (loading) return <div>Загрузка...</div>;

  const WorkspaceApp = () => (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <h1>Управление строительными проектами</h1>
            {currentProject && (
              <div className="current-project-badge">
                <span className="project-badge-icon">🏗</span>
                <span className="project-badge-name">{currentProject.name}</span>
                <button
                  className="btn-switch-project"
                  onClick={handleSwitchProject}
                  title="Сменить объект"
                >
                  ⇄ Сменить объект
                </button>
              </div>
            )}
          </div>
          <div className="user-info-header">
            <span className="user-name">{user?.full_name}</span>
            <span className="user-role">({user?.role})</span>
            <button onClick={handleLogout} className="btn-logout-header">Выйти</button>
          </div>
        </div>
      </header>

      <nav className="tabs">
        <button className={activeTab === 'schedule'    ? 'active' : ''} onClick={() => handleSetActiveTab('schedule')}>График</button>
        <button className={activeTab === 'monthly'     ? 'active' : ''} onClick={() => handleSetActiveTab('monthly')}>МСГ</button>
        <button className={activeTab === 'daily'       ? 'active' : ''} onClick={() => handleSetActiveTab('daily')}>Ежедневные наряды</button>
        <button className={activeTab === 'analytics'   ? 'active' : ''} onClick={() => handleSetActiveTab('analytics')}>Аналитика</button>
        <button className={activeTab === 'directories' ? 'active' : ''} onClick={() => handleSetActiveTab('directories')}>Справочники</button>
        {user?.role === 'admin' && (
          <button className={activeTab === 'admin' ? 'active' : ''} onClick={() => handleSetActiveTab('admin')}>Админ-панель</button>
        )}
      </nav>

      <Toolbar
        activeTab={activeTab}
        showGantt={showGantt}
        onToggleGantt={() => setShowGantt(!showGantt)}
        onShowColumnSettings={handleShowColumnSettings}
        onShowFilters={handleShowFilters}
        onScheduleCleared={handleScheduleCleared}
        onDownloadTemplate={handleDownloadTemplate}
        onUploadTemplate={handleUploadTemplate}
      />

      <main className="content">
        {activeTab === 'schedule' && (
          <Schedule
            key={scheduleKey.current}
            showGantt={showGantt}
            onShowColumnSettings={(h) => (columnSettingsHandlers.current.schedule = h)}
            onShowFilters={(h) => (filtersHandlers.current.schedule = h)}
          />
        )}
        {activeTab === 'monthly' && (
          <MonthlyOrder
            showGantt={showGantt}
            onShowColumnSettings={(h) => (columnSettingsHandlers.current.monthly = h)}
            onShowFilters={(h) => (filtersHandlers.current.monthly = h)}
          />
        )}
        {activeTab === 'daily' && (
          <DailyOrders
            onShowColumnSettings={(h) => (columnSettingsHandlers.current.daily = h)}
          />
        )}
        {activeTab === 'analytics' && <Analytics />}
        {activeTab === 'directories' && <Directories />}
        {activeTab === 'admin' && user?.role === 'admin' && <AdminPanel />}
      </main>
    </div>
  );

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={
            !isAuthenticated
              ? <Login onLoginSuccess={handleLoginSuccess} />
              : <Navigate to="/" replace />
          }
        />
        <Route
          path="/"
          element={
            !isAuthenticated
              ? <Navigate to="/login" replace />
              : !currentProject
                ? <ProjectSelect user={user} onLogout={handleLogout} onSelect={handleProjectSelect} />
                : <WorkspaceApp />
          }
        />
      </Routes>
    </Router>
  );
}

function App() {
  return (
    <ProjectProvider>
      <AppInner />
    </ProjectProvider>
  );
}

export default App;
