# Construction Manager - Система управления строительными проектами

## Описание

Web-приложение для управления строительными проектами с поддержкой real-time обновлений.

## Функционал

- ✅ **График работ** - диаграмма Ганта с фильтрацией
- ✅ **Наряд на месяц** - планирование по месяцам
- ✅ **Ежедневные наряды** - учет работ по дням
- ✅ **Аналитика** - статистика выполнения
- ✅ **Админ-панель** - управление пользователями
- ✅ **Импорт/Экспорт Excel** - работа с шаблонами
- ✅ **Real-time обновления** - мгновенная синхронизация данных
- ✅ **Многопользовательский режим** - одновременная работа

## Технологии

### Backend
- Python 3.10+
- FastAPI - веб-фреймворк
- SQLAlchemy - ORM
- PostgreSQL - база данных
- WebSocket - real-time коммуникация
- Pydantic - валидация данных
- OpenPyXL - работа с Excel

### Frontend
- React 18
- JavaScript (ES6+)
- WebSocket API
- CSS3

## Установка

### Предварительные требования

- Python 3.10+
- Node.js 16+
- PostgreSQL 13+

### Backend

1. Клонируйте репозиторий:
```bash
git clone https://github.com/Zelurg/construction-manager.git
cd construction-manager
```

2. Создайте виртуальное окружение:
```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

3. Установите зависимости:
```bash
pip install -r requirements.txt
```

4. Создайте `.env` файл:
```bash
cp .env.example .env
```

Редактируйте `.env` с вашими настройками базы данных.

5. Создайте администратора:
```bash
python create_admin.py
```

6. Запустите сервер:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Или используйте батник (Windows):
```bash
start-backend.bat
```

### Frontend

1. Перейдите в папку frontend:
```bash
cd frontend
```

2. Установите зависимости:
```bash
npm install
```

3. Запустите приложение:
```bash
npm start
```

Или используйте батник (Windows):
```bash
start-frontend.bat
```

## Использование

1. Откройте браузер: `http://localhost:3000`
2. Войдите с учетными данными администратора
3. Импортируйте данные через Excel или создайте вручную

## Real-Time Обновления

Приложение поддерживает мгновенную синхронизацию данных между всеми подключенными пользователями через WebSocket.

Подробнее: [WEBSOCKET_GUIDE.md](WEBSOCKET_GUIDE.md)

## Структура проекта

```
construction-manager/
├── backend/
│   ├── app/
│   │   ├── routes/          # API роуты
│   │   ├── models.py        # Модели базы данных
│   │   ├── schemas.py       # Pydantic схемы
│   │   ├── database.py      # Настройки БД
│   │   ├── websocket_manager.py  # WebSocket менеджер
│   │   └── main.py          # Главный файл
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── components/      # React компоненты
│   │   ├── services/        # API и WebSocket сервисы
│   │   ├── styles/          # CSS стили
│   │   └── App.js
│   └── package.json
│
├── README.md
└── WEBSOCKET_GUIDE.md
```

## API Документация

После запуска бэкенда доступна автоматическая документация API:

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Роли пользователей

- **admin** - полный доступ ко всем функциям
- **user** - редактирование данных
- **viewer** - только просмотр

## Лицензия

MIT License

## Автор

Zelurg - [GitHub](https://github.com/Zelurg)
