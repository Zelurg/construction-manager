#!/usr/bin/env python3
"""
Скрипт для применения всех миграций к PostgreSQL базе данных

Usage:
    python apply_migration_postgres.py
"""

import psycopg2
from psycopg2 import sql
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

def get_db_connection():
    """Получаем подключение к PostgreSQL из DATABASE_URL"""
    database_url = os.getenv('DATABASE_URL')
    
    if not database_url:
        print("Ошибка: DATABASE_URL не установлена в .env файле")
        sys.exit(1)
    
    # Парсим URL базы данных
    # Формат: postgresql://user:password@host:port/database
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
        print(f"Ошибка подключения к БД: {e}")
        print(f"DATABASE_URL: {database_url}")
        sys.exit(1)

def convert_sqlite_to_postgres(sql_text):
    """Конвертирует SQLite синтаксис в PostgreSQL"""
    
    # Заменяем типы данных
    sql_text = sql_text.replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'SERIAL PRIMARY KEY')
    sql_text = sql_text.replace('AUTOINCREMENT', '')
    sql_text = sql_text.replace('INTEGER', 'INTEGER')
    sql_text = sql_text.replace('TEXT', 'VARCHAR(255)')
    sql_text = sql_text.replace('REAL', 'DECIMAL(10,2)')
    sql_text = sql_text.replace('BOOLEAN', 'BOOLEAN')
    
    # Заменяем CURRENT_TIMESTAMP на NOW()
    sql_text = sql_text.replace('DEFAULT CURRENT_TIMESTAMP', 'DEFAULT NOW()')
    
    # Удаляем IF NOT EXISTS для индексов (в PostgreSQL используется другой синтаксис)
    sql_text = sql_text.replace('CREATE INDEX IF NOT EXISTS', 'CREATE INDEX IF NOT EXISTS')
    
    return sql_text

def apply_migration_file(conn, migration_file):
    """Применяет одну миграцию из файла"""
    
    if not migration_file.exists():
        print(f"  Пропущен: файл не найден - {migration_file.name}")
        return False
    
    with open(migration_file, 'r', encoding='utf-8') as f:
        migration_sql = f.read()
    
    # Конвертируем синтаксис
    migration_sql = convert_sqlite_to_postgres(migration_sql)
    
    try:
        cursor = conn.cursor()
        
        # Разбиваем на отдельные команды и выполняем
        commands = [cmd.strip() for cmd in migration_sql.split(';') if cmd.strip()]
        
        for command in commands:
            if command and not command.startswith('--'):
                try:
                    cursor.execute(command)
                except psycopg2.errors.DuplicateTable:
                    print(f"    Таблица уже существует, пропускаем...")
                    conn.rollback()
                except psycopg2.errors.DuplicateObject:
                    print(f"    Индекс уже существует, пропускаем...")
                    conn.rollback()
                except Exception as e:
                    print(f"    Ошибка при выполнении команды: {e}")
                    print(f"    Команда: {command[:100]}...")
                    conn.rollback()
                    raise
        
        conn.commit()
        cursor.close()
        print(f"  ✅ Применена: {migration_file.name}")
        return True
        
    except Exception as e:
        print(f"  ❌ Ошибка при применении {migration_file.name}: {e}")
        conn.rollback()
        return False

def check_tables_exist(conn):
    """Проверяет какие таблицы существуют"""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """)
    tables = cursor.fetchall()
    cursor.close()
    return [table[0] for table in tables]

def main():
    print("=" * 60)
    print("Применение миграций к PostgreSQL базе данных")
    print("=" * 60)
    
    # Подключаемся к БД
    print("\n1. Подключение к базе данных...")
    conn = get_db_connection()
    print("   ✅ Подключение установлено")
    
    # Проверяем текущие таблицы
    print("\n2. Проверка текущих таблиц...")
    existing_tables = check_tables_exist(conn)
    print(f"   Найдено таблиц: {len(existing_tables)}")
    for table in existing_tables:
        print(f"     - {table}")
    
    # Путь к миграциям
    migrations_dir = Path(__file__).parent / 'migrations'
    
    # Список миграций в нужном порядке
    migrations = [
        'add_sections_support.sql',
        'add_employees_and_executors.sql',
        'add_enhanced_attributes.sql',
    ]
    
    print("\n3. Применение миграций...")
    applied_count = 0
    
    for migration_name in migrations:
        migration_file = migrations_dir / migration_name
        print(f"\n  Миграция: {migration_name}")
        if apply_migration_file(conn, migration_file):
            applied_count += 1
    
    # Проверяем результат
    print("\n4. Проверка результата...")
    new_tables = check_tables_exist(conn)
    print(f"   Всего таблиц после миграции: {len(new_tables)}")
    
    added_tables = set(new_tables) - set(existing_tables)
    if added_tables:
        print(f"   Добавлено новых таблиц: {len(added_tables)}")
        for table in sorted(added_tables):
            print(f"     + {table}")
    
    conn.close()
    
    print("\n" + "=" * 60)
    print(f"✅ Миграция завершена! Применено: {applied_count} из {len(migrations)}")
    print("=" * 60)
    print("\nТеперь перезапусти сервер командой: start-backend.bat")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nПрервано пользователем")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Критическая ошибка: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
