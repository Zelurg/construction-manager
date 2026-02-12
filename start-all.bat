@echo off
echo ========================================
echo   Construction Manager
echo   Запуск всего приложения
echo ========================================
echo.
echo Запуск backend и frontend серверов...
echo.

REM Запуск backend в отдельном окне
echo [1/2] Запуск Backend...
start "Construction Manager - Backend" cmd /k "call start-backend.bat"

REM Подождем 3 секунды чтобы backend успел запуститься
timeout /t 3 /nobreak >nul

REM Запуск frontend в отдельном окне
echo [2/2] Запуск Frontend...
start "Construction Manager - Frontend" cmd /k "call start-frontend.bat"

echo.
echo ========================================
echo Готово!
echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo API Docs: http://localhost:8000/docs
echo.
echo Для доступа из локальной сети используйте ваш IP адрес
echo Чтобы узнать IP, запустите: show-network-info.bat
echo ========================================
echo.
