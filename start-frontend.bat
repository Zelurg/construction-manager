@echo off
echo ========================================
echo   Construction Manager - Frontend
echo ========================================
echo.
echo Запуск frontend сервера...
echo Сервер будет доступен с любых устройств в локальной сети
echo.

cd frontend

if not exist node_modules (
    echo [WARNING] node_modules не найдены!
    echo [INFO] Установка зависимостей...
    call npm install
    echo.
)

echo.
echo Сервер запускается на http://localhost:5173
echo Также доступен по IP адресу вашего компьютера
echo.
echo Для остановки нажмите Ctrl+C
echo ========================================
echo.

npm run dev
