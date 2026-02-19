import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * ProjectContext — хранит текущий выбранный объект.
 *
 * Логика для джуна:
 *  - createContext()      → создаём «коробку», которую можно читать из любого компонента
 *  - Provider             → оборачиваем всё приложение, чтобы «коробка» была доступна везде
 *  - useProject()         → хук, через который компонент читает/меняет проект
 *  - localStorage         → сохраняем выбор между перезагрузками страницы
 */

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const [currentProject, setCurrentProjectState] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('currentProject')) || null;
    } catch {
      return null;
    }
  });

  const setCurrentProject = useCallback((project) => {
    setCurrentProjectState(project);
    if (project) {
      localStorage.setItem('currentProject', JSON.stringify(project));
    } else {
      localStorage.removeItem('currentProject');
    }
  }, []);

  const clearProject = useCallback(() => {
    setCurrentProjectState(null);
    localStorage.removeItem('currentProject');
  }, []);

  return (
    <ProjectContext.Provider value={{ currentProject, setCurrentProject, clearProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used inside ProjectProvider');
  return ctx;
}

export default ProjectContext;
