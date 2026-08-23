"""Миграция: добавить текстовые колонки ИД в таблицу tasks.

Добавляет поля id_number, id_volume, id_status, id_access, если их ещё нет.
Скрипт DB-агностичный (работает и с SQLite, и с PostgreSQL).

Запуск (из папки backend):
    python migrations/add_id_columns.py
"""
import os
import sys
from sqlalchemy import inspect, text

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine

NEW_COLUMNS = [
    ("id_number", "VARCHAR"),
    ("id_volume", "VARCHAR"),
    ("id_status", "VARCHAR"),
    ("id_access", "VARCHAR"),
]


def migrate():
    inspector = inspect(engine)
    existing_names = {c["name"] for c in inspector.get_columns("tasks")}
    with engine.begin() as conn:
        for col, ctype in NEW_COLUMNS:
            if col in existing_names:
                print(f"  {col}: уже существует, пропускаем")
                continue
            conn.execute(text(f"ALTER TABLE tasks ADD COLUMN {col} {ctype}"))
            print(f"  {col}: добавлена колонка {ctype}")
    print("Готово.")


if __name__ == "__main__":
    print("Добавление колонок ИД в tasks...")
    migrate()
