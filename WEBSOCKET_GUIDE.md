# WebSocket Real-Time Updates - Руководство

## Обзор

Система real-time обновлений позволяет нескольким пользователям работать с приложением одновременно, автоматически получая изменения без перезагрузки страницы.

## Архитектура

### Backend (FastAPI)

1. **WebSocket Manager** (`backend/app/websocket_manager.py`)
   - Управляет всеми активными WebSocket подключениями
   - Поддерживает подписки на разные типы событий
   - Автоматически очищает отключенные соединения

2. **WebSocket Route** (`backend/app/routes/websocket.py`)
   - Эндпоинт: `ws://localhost:8000/api/ws`
   - Поддерживает команды subscribe/unsubscribe
   - Отправляет ping/pong для keep-alive

3. **Обновленные роуты**
   - `schedule.py` - уведомления о задачах
   - `daily.py` - уведомления о ежедневных работах
   - `monthly.py` - уведомления о месячных задачах

### Frontend (React)

1. **WebSocket Service** (`frontend/src/services/websocket.js`)
   - Singleton класс для управления подключением
   - Автоматическое переподключение при разрыве связи
   - Система слушателей событий

2. **Интеграция в компоненты**
   - Schedule.js
   - MonthlyOrder.js
   - DailyOrders.js

## Типы событий

### tasks
- `task_created` - создана новая задача
- `task_updated` - обновлена задача
- `task_deleted` - удалена задача

### daily_works
- `daily_work_created` - создана ежедневная работа

### monthly_tasks
- `monthly_task_created` - создана месячная задача

## Использование

### Запуск системы

1. **Запустите бэкенд:**
```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

2. **Запустите фронтенд:**
```bash
cd frontend
npm start
```

### Тестирование

1. **Откройте приложение в двух окнах браузера**
   - Окно 1: `http://localhost:3000`
   - Окно 2: `http://localhost:3000`

2. **Проверьте подключение**
   - Откройте консоль разработчика (F12)
   - Должно появиться: `WebSocket connected`

3. **Проверьте real-time обновления**
   - В окне 1: создайте новую задачу во вкладке "График"
   - В окне 2: задача должна появиться автоматически

## Пример использования в коде

### Frontend

```javascript
import websocketService from '../services/websocket';

function MyComponent() {
  useEffect(() => {
    // Подключаемся
    websocketService.connect();
    
    // Создаем обработчик
    const handleUpdate = (message) => {
      console.log('Received:', message.data);
      // Обновляем state
    };
    
    // Регистрируем обработчик
    websocketService.on('task_created', handleUpdate);
    
    // Очистка
    return () => {
      websocketService.off('task_created', handleUpdate);
    };
  }, []);
}
```

### Backend

```python
from ..websocket_manager import manager

@router.post("/tasks")
async def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    # Создаем задачу
    db_task = models.Task(**task.dict())
    db.add(db_task)
    db.commit()
    
    # Отправляем уведомление
    await manager.broadcast({
        "type": "task_created",
        "event": "tasks",
        "data": {...}
    }, event_type="tasks")
    
    return db_task
```

## Устранение неполадок

### WebSocket не подключается

1. Проверьте, что бэкенд запущен
2. Проверьте URL: `ws://localhost:8000/api/ws`
3. Проверьте CORS настройки в `backend/.env`

### Обновления не приходят

1. Откройте консоль и проверьте сообщения
2. Убедитесь, что обработчики зарегистрированы правильно
3. Проверьте типы событий (event types)

### Частые переподключения

1. Проверьте стабильность сетевого подключения
2. Увеличьте `reconnectDelay` в `websocket.js`
3. Проверьте логи бэкенда

## Масштабирование

Для продакшен развертывания рекомендуется:

1. **Использовать Redis** для обмена сообщениями между экземплярами сервера
2. **Load Balancer** с sticky sessions
3. **Мониторинг** количества активных подключений
4. **Ограничение** количества подключений на пользователя
