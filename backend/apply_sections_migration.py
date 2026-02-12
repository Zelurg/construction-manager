#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт для применения миграции для поддержки иерархических разделов
Дата: 2026-02-12
"""

import psycopg2
from dotenv import load_dotenv
import os
import sys

def main():
    # Загружаем переменные окружения
    load_dotenv()
    
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("❌ Ошибка: не найдена переменная DATABASE_URL в .env")
        sys.exit(1)
    
    try:
        print("🔄 Подключение к базе данных...")
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()
        
        print("📝 Чтение файла миграции...")
        migration_path = 'migrations/add_sections_support.sql'
        if not os.path.exists(migration_path):
            print(f"❌ Ошибка: файл миграции не найден: {migration_path}")
            sys.exit(1)
        
        with open(migration_path, 'r', encoding='utf-8') as f:
            sql_script = f.read()
        
        print("⚡ Применение миграции...")
        cursor.execute(sql_script)
        
        conn.commit()
        
        print("\n" + "="*60)
        print("✅ Миграция успешно применена!")
        print("="*60)
        print("\nДобавленные поля в таблицу tasks:")
        print("  - is_section (BOOLEAN) - признак раздела")
        print("  - level (INTEGER) - уровень вложенности")
        print("  - parent_code (VARCHAR) - шифр родителя")
        print("\nСозданы индексы:")
        print("  - idx_tasks_parent_code")
        print("  - idx_tasks_is_section")
        print("\nТеперь можно загружать графики с иерархическими разделами!")
        print("\n")
        
        cursor.close()
        conn.close()
        
    except psycopg2.Error as e:
        print(f"\n❌ Ошибка базы данных: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Неожиданная ошибка: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
