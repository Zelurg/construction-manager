#!/usr/bin/env python3
"""
Скрипт для применения миграции для добавления таблиц equipment и daily_equipment_usage

Usage:
    python apply_equipment_migration.py
"""

import sqlite3
import os
import sys
from pathlib import Path

def apply_migration():
    # Определяем путь к БД
    db_path = os.getenv('DATABASE_URL', 'sqlite:///./construction_manager.db')
    
    # Убираем префикс sqlite:///
    if db_path.startswith('sqlite:///'):
        db_path = db_path.replace('sqlite:///', '')
    
    # Проверяем, что БД существует
    if not os.path.exists(db_path):
        print(f"Ошибка: База данных не найдена: {db_path}")
        print("Сначала запустите приложение, чтобы создать БД")
        sys.exit(1)
    
    # Читаем файл миграции
    migration_file = Path(__file__).parent / 'migrations' / 'add_equipment_tables.sql'
    
    if not migration_file.exists():
        print(f"Ошибка: Файл миграции не найден: {migration_file}")
        sys.exit(1)
    
    with open(migration_file, 'r', encoding='utf-8') as f:
        migration_sql = f.read()
    
    try:
        # Подключаемся к БД
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("Применение миграции для таблиц техники...")
        
        # Выполняем миграцию
        cursor.executescript(migration_sql)
        
        # Проверяем, что таблицы созданы
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND (name='equipment' OR name='daily_equipment_usage')
        """)
        tables = cursor.fetchall()
        
        conn.commit()
        conn.close()
        
        print("\nМиграция успешно применена!")
        print(f"Создано таблиц: {len(tables)}")
        for table in tables:
            print(f"  - {table[0]}")
        
        print("\nТеперь вы можете использовать справочник техники!")
        
    except sqlite3.Error as e:
        print(f"Ошибка при применении миграции: {e}")
        sys.exit(1)

if __name__ == '__main__':
    apply_migration()
