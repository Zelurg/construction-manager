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
import authService from './services/authService';
import { importExportAPI } from './services/api';
import './styles/Toolbar.css';
import './styles/GanttChart.css';

function App() {
  const [activeTab, setActiveTab] = useState('schedule');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showGantt, setShowGantt] = useState(true);
  
  const columnSettingsHandlers = useRef({
    schedule: null,
    monthly: null,
    daily: null
  });

  const filtersHandlers = useRef({
    schedule: null,
    monthly: null
  });
  
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

  const handleLoginSuccess = () => {
    const currentUser = authService.getCurrentUser();
    setIsAuthenticated(true);
    setUser(currentUser);
  };

  const handleLogout = () => {
    authService.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await importExportAPI.downloadTemplate();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'template_schedule.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Ошибка скачивания шаблона:', error);
      alert('Ошибка скачивания шаблона');
    }
  };

  const handleUploadTemplate = async (file) => {
    try {
      const response = await importExportAPI.uploadTemplate(file);
      alert(`Успешно обработано задач: ${response.data.tasks_processed}\n` +
            (response.data.errors.length > 0 ? `Ошибки:\n${response.data.errors.join('\n')}` : ''));
      window.location.reload();
    } catch (error) {
      console.error('Ошибка загрузки файла:', error);
      alert('Ошибка загрузки файла: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleToggleGantt = () => {
    setShowGantt(!showGantt);
  };
  
  const handleShowColumnSettings = () => {
    const handler = columnSettingsHandlers.current[activeTab];
    if (handler) {
      handler();
    }
  };

  const handleShowFilters = () => {
    const handler = filtersHandlers.current[activeTab];
    if (handler) {
      handler();
    }
  };
  
  const handleScheduleCleared = () => {
    scheduleKey.current += 1;
  };

  if (loading) {
    return <div>Загрузка...</div>;
  }

  const MainApp = () => (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1>Управление строительными проектами</h1>
          <div className="user-info-header">
            <span className="user-name">{user?.full_name}</span>
            <span className="user-role">({user?.role})</span>
            <button onClick={handleLogout} className="btn-logout-header">
              Выйти
            </button>
          </div>
        </div>
      </header>
      
      <nav className="tabs">
        <button 
          className={activeTab === 'schedule' ? 'active' : ''} 
          onClick={() => setActiveTab('schedule')}
        >
          График
        </button>
        <button 
          className={activeTab === 'monthly' ? 'active' : ''} 
          onClick={() => setActiveTab('monthly')}
        >
          Наряд на месяц
        </button>
        <button 
          className={activeTab === 'daily' ? 'active' : ''} 
          onClick={() => setActiveTab('daily')}
        >
          Ежедневные наряды
        </button>
        <button 
          className={activeTab === 'analytics' ? 'active' : ''} 
          onClick={() => setActiveTab('analytics')}
        >
          Аналитика
        </button>
        <button 
          className={activeTab === 'directories' ? 'active' : ''} 
          onClick={() => setActiveTab('directories')}
        >
          Справочники
        </button>
        {user?.role === 'admin' && (
          <button 
            className={activeTab === 'admin' ? 'active' : ''} 
            onClick={() => setActiveTab('admin')}
          >
            Админ-панель
          </button>
        )}
      </nav>

      <Toolbar 
        activeTab={activeTab}
        showGantt={showGantt}
        onToggleGantt={handleToggleGantt}
        onShowColumnSettings={handleShowColumnSettings}
        onShowFilters={handleShowFilters}
        onScheduleCleared={handleScheduleCleared}
      />

      <main className="content">
        {activeTab === 'schedule' && (
          <Schedule 
            key={scheduleKey.current}
            showGantt={showGantt}
            onShowColumnSettings={(handler) => columnSettingsHandlers.current.schedule = handler}
            onShowFilters={(handler) => filtersHandlers.current.schedule = handler}
          />
        )}
        {activeTab === 'monthly' && (
          <MonthlyOrder 
            showGantt={showGantt}
            onShowColumnSettings={(handler) => columnSettingsHandlers.current.monthly = handler}
            onShowFilters={(handler) => filtersHandlers.current.monthly = handler}
          />
        )}
        {activeTab === 'daily' && (
          <DailyOrders 
            onShowColumnSettings={(handler) => columnSettingsHandlers.current.daily = handler}
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
            !isAuthenticated ? (
              <Login onLoginSuccess={handleLoginSuccess} />
            ) : (
              <Navigate to="/" replace />
            )
          } 
        />

        <Route 
          path="/" 
          element={
            isAuthenticated ? (
              <MainApp />
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />
      </Routes>
    </Router>
  );
}

export default App;
