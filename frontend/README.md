# Construction Manager

Приложение для управления строительными проектами

## Структура

- `backend/` - FastAPI сервер
- `frontend/` - React приложение

## Запуск локально

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Отредактируйте .env с вашими данными
uvicorn app.main:app --reload
