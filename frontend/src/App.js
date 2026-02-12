import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import Schedule from './components/Schedule';
import MonthlyOrder from './components/MonthlyOrder';
import DailyOrders from './components/DailyOrders';
import Analytics from './components/Analytics';
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';
import authService from './services/authService';

function App() {
  const [activeTab, setActiveTab] = useState('schedule');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Проверка авторизации при загрузке
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

  if (loading) {
    return <div>Загрузка...</div>;
  }

  // Главный компонент приложения (старый функционал)
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
        {user?.role === 'admin' && (
          <button 
            className={activeTab === 'admin' ? 'active' : ''} 
            onClick={() => setActiveTab('admin')}
          >
            Админ-панель
          </button>
        )}
      </nav>

      <main className="content">
        {activeTab === 'schedule' && <Schedule />}
        {activeTab === 'monthly' && <MonthlyOrder />}
        {activeTab === 'daily' && <DailyOrders />}
        {activeTab === 'analytics' && <Analytics />}
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
