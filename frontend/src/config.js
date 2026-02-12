// Конфигурация API и WebSocket URL
// Автоматически определяет правильный URL в зависимости от того,
// откуда открыто приложение (localhost или IP адрес)

const getApiUrl = () => {
  // Если запущено на localhost, используем localhost
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8000/api';
  }
  // Иначе используем IP хоста, где запущен фронтенд
  // Это позволяет работать в локальной сети
  return `http://${window.location.hostname}:8000/api`;
};

const getWsUrl = () => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'ws://localhost:8000/api/ws';
  }
  return `ws://${window.location.hostname}:8000/api/ws`;
};

export const API_URL = getApiUrl();
export const WS_URL = getWsUrl();

// Для отладки
console.log('API URL:', API_URL);
console.log('WebSocket URL:', WS_URL);
