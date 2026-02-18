-- Миграция для добавления таблиц equipment и daily_equipment_usage (PostgreSQL)

-- Создание таблицы equipment (справочник техники)
CREATE TABLE IF NOT EXISTS equipment (
    id SERIAL PRIMARY KEY,
    equipment_type VARCHAR(255) NOT NULL,  -- Вид техники (экскаватор, кран, бульдозер и т.д.)
    model VARCHAR(255) NOT NULL,  -- Модель техники
    registration_number VARCHAR(50) NOT NULL UNIQUE,  -- Гос. номер (уникальный)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,  -- Активна ли техника
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Создание индекса для быстрого поиска по гос. номеру
CREATE INDEX IF NOT EXISTS idx_equipment_registration_number ON equipment(registration_number);

-- Создание индекса для фильтрации по активности
CREATE INDEX IF NOT EXISTS idx_equipment_is_active ON equipment(is_active);

-- Создание таблицы daily_equipment_usage (использование техники за день)
CREATE TABLE IF NOT EXISTS daily_equipment_usage (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,  -- Дата работы
    equipment_id INTEGER NOT NULL,  -- ID техники из справочника
    machine_hours FLOAT NOT NULL DEFAULT 8.0,  -- Отработанные машиночасы
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (equipment_id) REFERENCES equipment (id) ON DELETE RESTRICT
);

-- Создание индекса для быстрого поиска по дате
CREATE INDEX IF NOT EXISTS idx_daily_equipment_usage_date ON daily_equipment_usage(date);

-- Создание индекса для быстрого поиска по equipment_id
CREATE INDEX IF NOT EXISTS idx_daily_equipment_usage_equipment_id ON daily_equipment_usage(equipment_id);

-- Создание составного индекса для частых запросов по дате и технике
CREATE INDEX IF NOT EXISTS idx_daily_equipment_usage_date_equipment ON daily_equipment_usage(date, equipment_id);
