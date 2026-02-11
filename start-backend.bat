@echo off
echo Starting Backend...
cd backend
call venv\Scripts\activate
start cmd /k "uvicorn app.main:app --reload"