-- Миграция для добавления новых полей в таблицу tasks
-- Дата: 2026-02-12
-- Описание: Добавление полей для цены, трудозатрат, машиночасов и исполнителя
-- СУБД: PostgreSQL

-- Добавляем новые колонки (PostgreSQL синтаксис)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS unit_price DOUBLE PRECISION DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS labor_per_unit DOUBLE PRECISION DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS machine_hours_per_unit DOUBLE PRECISION DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS executor VARCHAR(255);

-- Проверка успешности миграции
SELECT 'Migration completed successfully' AS status;
