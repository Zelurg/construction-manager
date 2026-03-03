"""Миграция: заменить статус 'gray'/'NULL' -> 'white' для всех записей в tasks.
Запускать один раз на VPS после деплоя.
"""
import os
import sys
from sqlalchemy import text

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import engine

FIELDS = ['status_people', 'status_equipment', 'status_mtr', 'status_access']

def migrate():
    with engine.begin() as conn:
        total = 0
        for field in FIELDS:
            result = conn.execute(
                text(f"UPDATE tasks SET {field} = 'white' WHERE {field} = 'gray' OR {field} IS NULL")
            )
            n = result.rowcount
            total += n
            print(f"  {field}: обновлено {n} строк")
        print(f"\nИтого обновлено: {total} значений")

if __name__ == '__main__':
    print("Запуск миграции checklist gray -> white...")
    migrate()
    print("Готово.")
