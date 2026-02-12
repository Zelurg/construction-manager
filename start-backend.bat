@echo off
echo ========================================
echo   Construction Manager - Backend
echo ========================================
echo.
echo Запуск backend сервера...
echo Сервер будет доступен с любых устройств в локальной сети
echo.

cd backend

if not exist venv (
    echo [ERROR] Виртуальное окружение не найдено!
    echo [INFO] Создайте его командой: python -m venv venv
    pause
    exit /b 1
)

echo Активация виртуального окружения...
call venv\Scripts\activate

if not exist .env (
    echo [WARNING] Файл .env не найден!
    echo [INFO] Скопируйте .env.example в .env и настройте его
    pause
)

echo.
echo Сервер запускается на http://0.0.0.0:8000
echo API документация: http://localhost:8000/docs
echo.
echo Для остановки нажмите Ctrl+C
echo ========================================
echo.

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
