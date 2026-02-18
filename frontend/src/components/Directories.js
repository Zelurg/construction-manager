import React, { useState } from 'react';
import Employees from './Employees';
import Equipment from './Equipment';
import '../styles/Directories.css';

/**
 * Компонент для управления справочниками
 */
function Directories() {
  const [activeSubTab, setActiveSubTab] = useState('employees');

  return (
    <div className="directories">
      <div className="directories-header">
        <h2>Справочники</h2>
      </div>

      {/* Подвкладки */}
      <nav className="sub-tabs">
        <button
          className={activeSubTab === 'employees' ? 'active' : ''}
          onClick={() => setActiveSubTab('employees')}
        >
          Сотрудники
        </button>
        <button
          className={activeSubTab === 'equipment' ? 'active' : ''}
          onClick={() => setActiveSubTab('equipment')}
        >
          Техника
        </button>
      </nav>

      {/* Контент выбранной подвкладки */}
      <div className="directories-content">
        {activeSubTab === 'employees' && <Employees />}
        {activeSubTab === 'equipment' && <Equipment />}
      </div>
    </div>
  );
}

export default Directories;
