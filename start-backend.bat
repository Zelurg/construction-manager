@echo off
echo ========================================
echo   Construction Manager - Backend
echo ========================================
echo.
echo Запуск backend сервера...
echo Сервер будет доступен с любых устройств в локальной сети
echo.

cd backend

:: Проверяем виртуальное окружение в backend/venv
if exist venv\Scripts\activate.bat (
    echo Активация виртуального окружения (backend\venv)...
    call venv\Scripts\activate.bat
    goto :start_server
)

:: Проверяем виртуальное окружение в корне проекта
if exist ..\venv\Scripts\activate.bat (
    echo Активация виртуального окружения (..\venv)...
    call ..\venv\Scripts\activate.bat
    goto :start_server
)

:: Если не найдено
echo [ERROR] Виртуальное окружение не найдено!
echo [INFO] Создайте его командой:
echo        cd backend
echo        python -m venv venv
echo.
pause
exit /b 1

:start_server

if not exist .env (
    echo [WARNING] Файл .env не найден!
    echo [INFO] Создайте файл backend\.env с настройками БД
    echo.
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
