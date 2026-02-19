"""
Миграция: добавление колонок is_ancillary в daily_works,
и разрешение NULL для task_id (сопутствующие работы не имеют задачи).

Запускать на VPS:
    cd /opt/construction-manager/backend
    source venv/bin/activate
    python3 migrations/add_ancillary_works.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import engine
from sqlalchemy import text

def run_migration():
    with engine.connect() as conn:
        # 1. Добавляем флаг is_ancillary
        try:
            conn.execute(text("""
                ALTER TABLE daily_works
                ADD COLUMN is_ancillary BOOLEAN NOT NULL DEFAULT FALSE;
            """))
            print("✅ Колонка is_ancillary добавлена в daily_works")
        except Exception as e:
            print(f"⚠️  daily_works.is_ancillary: {e} (возможно уже существует)")

        # 2. Снимаем NOT NULL с task_id (чтобы сопутствующие могли иметь NULL)
        # PostgreSQL: нужно DROP CONSTRAINT если есть, затем ALTER COLUMN
        try:
            conn.execute(text("""
                ALTER TABLE daily_works
                ALTER COLUMN task_id DROP NOT NULL;
            """))
            print("✅ task_id в daily_works теперь допускает NULL")
        except Exception as e:
            print(f"⚠️  task_id nullable: {e} (возможно уже nullable)")

        conn.commit()
        print("\n✅ Миграция завершена!")
        print("ℹ️  Существующие записи получили is_ancillary = FALSE автоматически")

if __name__ == "__main__":
    run_migration()
