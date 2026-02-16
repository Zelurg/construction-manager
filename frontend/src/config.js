

// Конфигурация API и WebSocket URL
// Автоматически определяет правильный URL в зависимости от того,
// откуда открыто приложение (localhost или IP адрес)

const getApiUrl = () => {
  // Для production всегда используем /api через Nginx
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `/api`;
  }
  // Иначе используем на localhost, используем localhost
  return `http://localhost:8000/api`;
};

const getWsUrl = () => {
  // Для production используем относительный путь через Nginx
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    // Используем wss:// если страница загружена по https://
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.hostname}/ws`;
  }
  return `ws://localhost:8000/api/ws`;
};

export const API_URL = getApiUrl();
export const WS_URL = getWsUrl();

// Для отладки
console.log('API URL:', API_URL);
console.log('WebSocket URL:', WS_URL);

