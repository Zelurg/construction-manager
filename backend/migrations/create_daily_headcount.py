"""
Миграция: создание таблицы daily_headcount если не существует.
Запустить ОДИН РАЗ на VPS:
  cd /path/to/backend
  python migrations/create_daily_headcount.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine, Base
from app.models import DailyHeadcount  # noqa — нужен для регистрации модели
from sqlalchemy import text, inspect

def run():
    inspector = inspect(engine)
    if 'daily_headcount' in inspector.get_table_names():
        print("Таблица daily_headcount уже существует — пропускаем.")
        return

    print("Создаём таблицу daily_headcount...")
    Base.metadata.create_all(engine, tables=[DailyHeadcount.__table__])
    print("Готово!")

if __name__ == '__main__':
    run()
