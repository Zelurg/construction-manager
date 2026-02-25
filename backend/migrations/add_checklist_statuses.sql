-- Миграция: добавление чек-лист статусов к задачам
-- Запустить: psql -U <user> -d <dbname> -f add_checklist_statuses.sql

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_people VARCHAR DEFAULT 'gray' NOT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_equipment VARCHAR DEFAULT 'gray' NOT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_mtr VARCHAR DEFAULT 'gray' NOT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_access VARCHAR DEFAULT 'gray' NOT NULL;

-- Обновляем существующие записи (на случай если DEFAULT не применился)
UPDATE tasks SET status_people = 'gray' WHERE status_people IS NULL;
UPDATE tasks SET status_equipment = 'gray' WHERE status_equipment IS NULL;
UPDATE tasks SET status_mtr = 'gray' WHERE status_mtr IS NULL;
UPDATE tasks SET status_access = 'gray' WHERE status_access IS NULL;
