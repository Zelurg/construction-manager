"""Миграция: заменить статус 'gray' -> 'white' для всех записей в schedule_tasks.
Запускать один раз на VPS после деплоя.
"""
import os
import sys
import asyncio
from sqlalchemy import text

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import engine

FIELDS = ['status_people', 'status_equipment', 'status_mtr', 'status_access']

async def migrate():
    async with engine.begin() as conn:
        total = 0
        for field in FIELDS:
            result = await conn.execute(
                text(f"UPDATE schedule_tasks SET {field} = 'white' WHERE {field} = 'gray' OR {field} IS NULL")
            )
            n = result.rowcount
            total += n
            print(f"  {field}: обновлено {n} строк")
        print(f"\nИтого обновлено: {total} значений")

if __name__ == '__main__':
    print("Запуск миграции checklist gray -> white...")
    asyncio.run(migrate())
    print("Готово.")
