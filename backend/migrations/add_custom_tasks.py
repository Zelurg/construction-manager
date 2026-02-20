"""
Миграция: добавляет поля is_custom и sort_order в таблицу tasks.
Запускать один раз на VPS:
    cd /path/to/backend
    python migrations/add_custom_tasks.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from app.database import DATABASE_URL

def run():
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        # Проверяем, нет ли уже колонок (idempotent)
        result = conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='tasks' AND column_name='is_custom'"
        ))
        if result.fetchone():
            print("Миграция уже применена (is_custom существует). Пропускаем.")
            return

        print("Добавляем is_custom...")
        conn.execute(text(
            "ALTER TABLE tasks ADD COLUMN is_custom BOOLEAN NOT NULL DEFAULT FALSE"
        ))

        print("Добавляем sort_order...")
        conn.execute(text(
            "ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"
        ))

        # Заполняем sort_order для существующих строк по порядку кода
        print("Инициализируем sort_order для существующих задач...")
        conn.execute(text("""
            WITH ordered AS (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY code) AS rn
                FROM tasks
            )
            UPDATE tasks SET sort_order = ordered.rn
            FROM ordered WHERE tasks.id = ordered.id
        """))

        conn.commit()
        print("Миграция успешно применена.")

if __name__ == "__main__":
    run()
