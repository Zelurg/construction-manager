import React, { createContext, useContext, useState } from 'react';
import authService from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // Читаем юзера синхронно при инициализации — без useEffect.
  // Это гарантирует, что isAdmin будет корректным уже при первом рендере
  // любого дочернего компонента (в т.ч. MonthlyOrder).
  const [user, setUser] = useState(() => authService.getCurrentUser());

  const value = {
    user,
    setUser,
    loading: false,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
