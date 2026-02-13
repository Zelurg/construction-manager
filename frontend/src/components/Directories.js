import React, { useState } from 'react';
import Employees from './Employees';
import '../styles/Directories.css';

/**
 * Компонент для управления справочниками
 * Пока есть только справочник сотрудников,
 * но структура позволяет добавлять новые
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
        {/* Здесь можно добавить другие справочники в будущем */}
        {/*
        <button
          className={activeSubTab === 'equipment' ? 'active' : ''}
          onClick={() => setActiveSubTab('equipment')}
        >
          Оборудование
        </button>
        <button
          className={activeSubTab === 'materials' ? 'active' : ''}
          onClick={() => setActiveSubTab('materials')}
        >
          Материалы
        </button>
        */}
      </nav>

      {/* Контент выбранной подвкладки */}
      <div className="directories-content">
        {activeSubTab === 'employees' && <Employees />}
        {/* Другие справочники будут здесь */}
      </div>
    </div>
  );
}

export default Directories;
