"""
Скрипт миграции базы данных:
Добавляет новые поля дат и копирует данные из старых полей.

Выполните этот скрипт ОДИН РАЗ после обновления кода:
python migrate_dates.py
"""

import sys
from sqlalchemy import create_engine, text, Column, Date, MetaData, Table, inspect
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

# Получаем URL базы данных
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("Ошибка: DATABASE_URL не найден в .env файле")
    sys.exit(1)

engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
session = Session()

print("🚀 Начинаем миграцию базы данных...")
print(f"🔗 Подключение: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'PostgreSQL'}")
print()

try:
    # Проверяем существуют ли новые колонки
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns('tasks')]
    
    new_columns_exist = all([
        'start_date_contract' in columns,
        'end_date_contract' in columns,
        'start_date_plan' in columns,
        'end_date_plan' in columns
    ])
    
    if new_columns_exist:
        print("✅ Новые колонки уже существуют. Миграция не требуется.")
        session.close()
        sys.exit(0)
    
    print("🛠️  Шаг 1: Добавление новых колонок...")
    
    # Добавляем новые колонки
    session.execute(text("""
        ALTER TABLE tasks 
        ADD COLUMN IF NOT EXISTS start_date_contract DATE,
        ADD COLUMN IF NOT EXISTS end_date_contract DATE,
        ADD COLUMN IF NOT EXISTS start_date_plan DATE,
        ADD COLUMN IF NOT EXISTS end_date_plan DATE
    """))
    session.commit()
    print("   ✅ Новые колонки добавлены")
    
    print("\n💾 Шаг 2: Копирование данных из старых полей...")
    
    # Копируем данные из start_date/end_date в новые поля
    session.execute(text("""
        UPDATE tasks 
        SET 
            start_date_contract = start_date,
            end_date_contract = end_date,
            start_date_plan = start_date,
            end_date_plan = end_date
        WHERE start_date IS NOT NULL OR end_date IS NOT NULL
    """))
    session.commit()
    
    # Подсчитываем количество обновленных записей
    result = session.execute(text("SELECT COUNT(*) FROM tasks WHERE start_date_contract IS NOT NULL"))
    count = result.scalar()
    print(f"   ✅ Данные скопированы для {count} задач")
    
    print("\n🗑️  Шаг 3: Удаление старых колонок...")
    
    # Удаляем старые колонки start_date и end_date
    session.execute(text("""
        ALTER TABLE tasks 
        DROP COLUMN IF EXISTS start_date,
        DROP COLUMN IF EXISTS end_date
    """))
    session.commit()
    print("   ✅ Старые колонки удалены")
    
    print("\n✨ Миграция завершена успешно!")
    print("\n📊 Структура таблицы tasks:")
    print("   - start_date_contract (дата старта контракт)")
    print("   - end_date_contract (дата финиша контракт)")
    print("   - start_date_plan (дата старта план)")
    print("   - end_date_plan (дата финиша план)")
    print("\n🚀 Теперь можно запускать backend!")
    
except Exception as e:
    print(f"\n❌ Ошибка при миграции: {e}")
    session.rollback()
    sys.exit(1)
finally:
    session.close()
