-- Миграция для добавления поддержки разделов
-- Дата: 2026-02-13
-- Описание: Добавление полей для иерархической структуры графика с разделами
-- СУБД: PostgreSQL

-- Добавляем новые колонки
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_section BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_code VARCHAR(50);

-- Изменяем существующие колонки на nullable для поддержки разделов
-- (Разделы могут не иметь ед.изм., объемов и дат)
ALTER TABLE tasks ALTER COLUMN unit DROP NOT NULL;
ALTER TABLE tasks ALTER COLUMN volume_plan DROP NOT NULL;
ALTER TABLE tasks ALTER COLUMN start_date_plan DROP NOT NULL;
ALTER TABLE tasks ALTER COLUMN end_date_plan DROP NOT NULL;
ALTER TABLE tasks ALTER COLUMN start_date_contract DROP NOT NULL;
ALTER TABLE tasks ALTER COLUMN end_date_contract DROP NOT NULL;

-- Устанавливаем значения по умолчанию
ALTER TABLE tasks ALTER COLUMN volume_plan SET DEFAULT 0;
ALTER TABLE tasks ALTER COLUMN volume_fact SET DEFAULT 0;

-- Создаем индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_tasks_parent_code ON tasks(parent_code);
CREATE INDEX IF NOT EXISTS idx_tasks_is_section ON tasks(is_section);
CREATE INDEX IF NOT EXISTS idx_tasks_level ON tasks(level);

-- Комментарии к полям
COMMENT ON COLUMN tasks.is_section IS 'Признак того, что строка является разделом (заголовком)';
COMMENT ON COLUMN tasks.level IS 'Уровень вложенности раздела (0 - корень, 1,2,3... - подразделы)';
COMMENT ON COLUMN tasks.parent_code IS 'Шифр родительского раздела для построения иерархии';
