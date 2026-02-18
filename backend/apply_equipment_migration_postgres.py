#!/usr/bin/env python3
"""
Скрипт для применения миграции для добавления таблиц equipment и daily_equipment_usage (PostgreSQL)

Usage:
    python apply_equipment_migration_postgres.py
"""

import psycopg2
from psycopg2 import sql
import os
import sys
from pathlib import Path
from urllib.parse import urlparse
from dotenv import load_dotenv

def get_db_connection():
    """Получаем подключение к PostgreSQL из DATABASE_URL"""
    # Загружаем .env
    load_dotenv()
    
    database_url = os.getenv('DATABASE_URL')
    
    if not database_url:
        print("\n❌ Ошибка: DATABASE_URL не установлена")
        print("\nПроверьте, что:")
        print("1. Файл backend/.env существует")
        print("2. В нём есть строка: DATABASE_URL=postgresql://...")
        sys.exit(1)
    
    print(f"🔗 Подключение к: {database_url.split('@')[1] if '@' in database_url else database_url}")
    
    # Парсим URL базы данных
    try:
        result = urlparse(database_url)
        connection = psycopg2.connect(
            database=result.path[1:],
            user=result.username,
            password=result.password,
            host=result.hostname,
            port=result.port
        )
        return connection
    except Exception as e:
        print(f"\n❌ Ошибка подключения к БД: {e}")
        print("\nПроверьте:")
        print("1. PostgreSQL сервер запущен")
        print("2. Параметры подключения верны")
        print("3. База данных существует")
        sys.exit(1)

def check_tables_exist(conn, table_names):
    """Проверяет какие таблицы существуют"""
    cursor = conn.cursor()
    placeholders = ','.join(['%s'] * len(table_names))
    cursor.execute(f"""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ({placeholders})
    """, table_names)
    existing = cursor.fetchall()
    cursor.close()
    return [table[0] for table in existing]

def apply_migration():
    print("\n" + "="*60)
    print("МИГРАЦИЯ: Добавление таблиц для справочника техники")
    print("="*60 + "\n")
    
    # Подключаемся к БД
    conn = get_db_connection()
    print("✅ Подключение установлено\n")
    
    # Проверяем, не существуют ли уже таблицы
    existing_tables = check_tables_exist(conn, ['equipment', 'daily_equipment_usage'])
    
    if existing_tables:
        print("⚠️  Внимание: Некоторые таблицы уже существуют:")
        for table in existing_tables:
            print(f"   - {table}")
        print("   Миграция будет пропущена (CREATE TABLE IF NOT EXISTS)\n")
    
    # Читаем файл миграции
    migration_file = Path(__file__).parent / 'migrations' / 'add_equipment_tables_postgres.sql'
    
    if not migration_file.exists():
        print(f"❌ Ошибка: Файл миграции не найден: {migration_file}")
        sys.exit(1)
    
    with open(migration_file, 'r', encoding='utf-8') as f:
        migration_sql = f.read()
    
    try:
        cursor = conn.cursor()
        
        print("🔧 Применение миграции...\n")
        
        # Разбиваем на отдельные команды
        commands = [cmd.strip() for cmd in migration_sql.split(';') if cmd.strip() and not cmd.strip().startswith('--')]
        
        for i, command in enumerate(commands, 1):
            try:
                cursor.execute(command)
                conn.commit()
                # Показываем что создается
                if 'CREATE TABLE' in command:
                    table_name = command.split('CREATE TABLE IF NOT EXISTS')[1].split('(')[0].strip()
                    print(f"   ✓ Создана таблица: {table_name}")
                elif 'CREATE INDEX' in command:
                    index_name = command.split('CREATE INDEX IF NOT EXISTS')[1].split('ON')[0].strip()
                    print(f"   ✓ Создан индекс: {index_name}")
            except psycopg2.errors.DuplicateTable as e:
                conn.rollback()
                print(f"   ℹ️  Таблица уже существует, пропускаем")
            except psycopg2.errors.DuplicateObject as e:
                conn.rollback()
                print(f"   ℹ️  Индекс уже существует, пропускаем")
            except Exception as e:
                conn.rollback()
                print(f"   ❌ Ошибка: {e}")
                print(f"   Команда: {command[:100]}...")
                raise
        
        cursor.close()
        
        # Проверяем результат
        final_tables = check_tables_exist(conn, ['equipment', 'daily_equipment_usage'])
        
        print("\n" + "="*60)
        print("✅ МИГРАЦИЯ ЗАВЕРШЕНА УСПЕШНО!")
        print("="*60)
        print(f"\nСоздано/проверено таблиц: {len(final_tables)}")
        for table in final_tables:
            print(f"   ✓ {table}")
        
        print("\nТеперь вы можете использовать справочник техники!")
        print("🔄 Перезапустите backend: sudo systemctl restart construction-manager\n")
        
    except Exception as e:
        print(f"\n❌ Ошибка при применении миграции: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    try:
        apply_migration()
    except KeyboardInterrupt:
        print("\n\n⚠️  Прервано пользователем")
        sys.exit(1)
