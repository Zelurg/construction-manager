-- Миграция для добавления поддержки разделов
-- Дата: 2026-02-12
-- Описание: Добавление полей для иерархической структуры графика с разделами
-- СУБД: PostgreSQL

-- Добавляем новые колонки
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_section BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_code VARCHAR(50);

-- ВАЖНО: Изменяем существующие колонки на nullable для поддержки разделов
ALTER TABLE tasks ALTER COLUMN unit DROP NOT NULL;
ALTER TABLE tasks ALTER COLUMN volume_plan DROP NOT NULL;
ALTER TABLE tasks ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE tasks ALTER COLUMN end_date DROP NOT NULL;

-- Устанавливаем значения по умолчанию для nullable полей
ALTER TABLE tasks ALTER COLUMN volume_plan SET DEFAULT 0;
ALTER TABLE tasks ALTER COLUMN volume_fact SET DEFAULT 0;

-- Создаем индексы для быстрого поиска родительских элементов
CREATE INDEX IF NOT EXISTS idx_tasks_parent_code ON tasks(parent_code);
CREATE INDEX IF NOT EXISTS idx_tasks_is_section ON tasks(is_section);
CREATE INDEX IF NOT EXISTS idx_tasks_level ON tasks(level);

-- Комментарии к полям
COMMENT ON COLUMN tasks.is_section IS 'Признак того, что строка является разделом (заголовком)';
COMMENT ON COLUMN tasks.level IS 'Уровень вложенности раздела (0 - корень, 1,2,3... - подразделы)';
COMMENT ON COLUMN tasks.parent_code IS 'Шифр родительского раздела для построения иерархии';

-- Проверка успешности миграции
SELECT 'Migration completed successfully' AS status;
