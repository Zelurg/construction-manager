"""
Миграция: добавление таблицы brigades и колонок brigade_id

Запускать на VPS:
    cd /opt/construction-manager/backend
    python migrations/add_brigades.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine
from sqlalchemy import text

def run_migration():
    with engine.connect() as conn:
        # 1. Создаём таблицу brigades
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS brigades (
                id SERIAL PRIMARY KEY,
                date DATE NOT NULL,
                name VARCHAR NOT NULL DEFAULT 'Бригада',
                "order" INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            );
        """))
        print("✅ Таблица brigades создана (или уже существует)")

        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_brigades_date ON brigades (date);"))
        print("✅ Индекс на brigades.date создан")

        # 2. Добавляем brigade_id в daily_works
        try:
            conn.execute(text("""
                ALTER TABLE daily_works
                ADD COLUMN brigade_id INTEGER REFERENCES brigades(id) ON DELETE SET NULL;
            """))
            print("✅ Колонка brigade_id добавлена в daily_works")
        except Exception as e:
            print(f"⚠️  daily_works.brigade_id: {e} (возможно уже существует)")

        # 3. Добавляем brigade_id в daily_executors
        try:
            conn.execute(text("""
                ALTER TABLE daily_executors
                ADD COLUMN brigade_id INTEGER REFERENCES brigades(id) ON DELETE SET NULL;
            """))
            print("✅ Колонка brigade_id добавлена в daily_executors")
        except Exception as e:
            print(f"⚠️  daily_executors.brigade_id: {e} (возможно уже существует)")

        # 4. Добавляем brigade_id в daily_equipment_usage
        try:
            conn.execute(text("""
                ALTER TABLE daily_equipment_usage
                ADD COLUMN brigade_id INTEGER REFERENCES brigades(id) ON DELETE SET NULL;
            """))
            print("✅ Колонка brigade_id добавлена в daily_equipment_usage")
        except Exception as e:
            print(f"⚠️  daily_equipment_usage.brigade_id: {e} (возможно уже существует)")

        conn.commit()
        print("\n✅ Миграция завершена успешно!")
        print("ℹ️  Существующие данные остаются с brigade_id = NULL")
        print("   Они будут видны в 'общем' блоке без бригады на фронтенде")

if __name__ == "__main__":
    run_migration()
