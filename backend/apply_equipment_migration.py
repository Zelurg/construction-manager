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
from dotenv import load_dotenv

def apply_migration():
    # Загружаем переменные окружения из .env
    load_dotenv()
    
    # Определяем путь к БД
    db_path = os.getenv('DATABASE_URL')
    
    if not db_path:
        print("Ошибка: Переменная DATABASE_URL не найдена в .env")
        print("Проверьте, что файл .env существует в директории backend/")
        sys.exit(1)
    
    print(f"Путь к БД из .env: {db_path}")
    
    # Убираем префикс sqlite:///
    if db_path.startswith('sqlite:///'):
        db_path = db_path.replace('sqlite:///', '')
        # Если путь относительный, делаем его абсолютным
        if not os.path.isabs(db_path):
            db_path = os.path.join(os.path.dirname(__file__), db_path)
    
    print(f"Абсолютный путь к БД: {db_path}")
    
    # Проверяем, что БД существует
    if not os.path.exists(db_path):
        print(f"\nОшибка: База данных не найдена: {db_path}")
        print("Сначала запустите приложение, чтобы создать БД")
        print("\nИли проверьте путь DATABASE_URL в файле .env")
        sys.exit(1)
    
    # Читаем файл миграции
    migration_file = Path(__file__).parent / 'migrations' / 'add_equipment_tables.sql'
    
    if not migration_file.exists():
        print(f"\nОшибка: Файл миграции не найден: {migration_file}")
        sys.exit(1)
    
    with open(migration_file, 'r', encoding='utf-8') as f:
        migration_sql = f.read()
    
    try:
        # Подключаемся к БД
        print(f"\nПодключение к БД: {db_path}")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Проверяем, не существуют ли уже таблицы
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND (name='equipment' OR name='daily_equipment_usage')
        """)
        existing_tables = cursor.fetchall()
        
        if existing_tables:
            print(f"\nВнимание: Некоторые таблицы уже существуют:")
            for table in existing_tables:
                print(f"  - {table[0]}")
            print("\nМиграция будет пропущена (используется CREATE TABLE IF NOT EXISTS)")
        
        print("\nПрименение миграции для таблиц техники...")
        
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
        
        print("\n✅ Миграция успешно применена!")
        print(f"\nСоздано/проверено таблиц: {len(tables)}")
        for table in tables:
            print(f"  ✓ {table[0]}")
        
        print("\nТеперь вы можете использовать справочник техники!")
        print("Перезапустите backend сервис: sudo systemctl restart construction-manager")
        
    except sqlite3.Error as e:
        print(f"\n❌ Ошибка при применении миграции: {e}")
        sys.exit(1)

if __name__ == '__main__':
    print("="*60)
    print("МИГРАЦИЯ: Добавление таблиц для справочника техники")
    print("="*60)
    apply_migration()
