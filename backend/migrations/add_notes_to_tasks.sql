-- Миграция: добавить поле notes (Примечание) в таблицу tasks
-- Применить на VPS: psql $DATABASE_URL -f add_notes_to_tasks.sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT;
