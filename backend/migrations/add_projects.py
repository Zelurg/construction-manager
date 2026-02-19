"""
Миграция: добавление мультипроектности.

Что делает:
1. Создаёт таблицу projects
2. Добавляет project_id в tasks и brigades
3. Создаёт объект "Основной объект" и привязывает к нему все существующие данные

Запуск на VPS:
    cd /opt/construction-manager/backend
    source venv/bin/activate
    python3 migrations/add_projects.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import engine
from sqlalchemy import text
from datetime import datetime

def run_migration():
    with engine.connect() as conn:

        # 1. Таблица projects
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS projects (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR NOT NULL,
                    description VARCHAR,
                    address VARCHAR,
                    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
                    updated_at TIMESTAMP DEFAULT NOW(),
                    created_at TIMESTAMP DEFAULT NOW()
                );
            """))
            print("✅ Таблица projects создана")
        except Exception as e:
            print(f"⚠️  projects: {e}")

        # 2. Создаём объект по умолчанию
        result = conn.execute(text(
            "SELECT id FROM projects WHERE name = 'Основной объект' LIMIT 1"
        ))
        row = result.fetchone()
        if row:
            default_id = row[0]
            print(f"ℹ️  Объект по умолчанию уже существует (id={default_id})")
        else:
            result = conn.execute(text(
                "INSERT INTO projects (name, description, updated_at, created_at) "
                "VALUES ('Основной объект', 'Создан автоматически при миграции', NOW(), NOW()) "
                "RETURNING id"
            ))
            default_id = result.fetchone()[0]
            print(f"✅ Создан объект 'Основной объект' (id={default_id})")

        # 3. project_id в tasks
        try:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id);"))
            print("✅ Колонка project_id добавлена в tasks")
        except Exception as e:
            print(f"⚠️  tasks.project_id: {e} (возможно уже существует)")

        # 4. project_id в brigades
        try:
            conn.execute(text("ALTER TABLE brigades ADD COLUMN project_id INTEGER REFERENCES projects(id);"))
            print("✅ Колонка project_id добавлена в brigades")
        except Exception as e:
            print(f"⚠️  brigades.project_id: {e} (возможно уже существует)")

        # 5. Привязываем существующие данные к объекту по умолчанию
        conn.execute(text(f"UPDATE tasks SET project_id = {default_id} WHERE project_id IS NULL;"))
        conn.execute(text(f"UPDATE brigades SET project_id = {default_id} WHERE project_id IS NULL;"))
        print(f"✅ Существующие tasks и brigades привязаны к объекту id={default_id}")

        # 6. Уникальность code теперь per-project (убираем глобальный unique если есть)
        try:
            conn.execute(text("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_code_key;"))
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_code_project "
                "ON tasks(project_id, code);"
            ))
            print("✅ Уникальность code переведена на уровень проекта")
        except Exception as e:
            print(f"⚠️  unique index: {e}")

        conn.commit()
        print("\n✅ Миграция завершена!")
        print(f"ℹ️  Все данные сохранены в объекте id={default_id} ('Основной объект')")

if __name__ == "__main__":
    run_migration()
