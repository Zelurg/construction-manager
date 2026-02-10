import React, { useState } from 'react';
import Schedule from './components/Schedule';
import MonthlyOrder from './components/MonthlyOrder';
import DailyOrders from './components/DailyOrders';
import Analytics from './components/Analytics';

function App() {
  const [activeTab, setActiveTab] = useState('schedule');

  return (
    <div className="app">
      <header className="header">
        <h1>Управление строительными проектами</h1>
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
      </nav>

      <main className="content">
        {activeTab === 'schedule' && <Schedule />}
        {activeTab === 'monthly' && <MonthlyOrder />}
        {activeTab === 'daily' && <DailyOrders />}
        {activeTab === 'analytics' && <Analytics />}
      </main>
    </div>
  );
}

export default App;
