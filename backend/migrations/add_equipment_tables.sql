-- Миграция для добавления таблиц equipment и daily_equipment_usage

-- Создание таблицы equipment (справочник техники)
CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_type VARCHAR NOT NULL,  -- Вид техники (экскаватор, кран, бульдозер и т.д.)
    model VARCHAR NOT NULL,  -- Модель техники
    registration_number VARCHAR NOT NULL UNIQUE,  -- Гос. номер (уникальный)
    is_active BOOLEAN NOT NULL DEFAULT 1,  -- Активна ли техника
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание индекса для быстрого поиска по гос. номеру
CREATE INDEX IF NOT EXISTS idx_equipment_registration_number ON equipment(registration_number);

-- Создание индекса для фильтрации по активности
CREATE INDEX IF NOT EXISTS idx_equipment_is_active ON equipment(is_active);

-- Создание таблицы daily_equipment_usage (использование техники за день)
CREATE TABLE IF NOT EXISTS daily_equipment_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,  -- Дата работы
    equipment_id INTEGER NOT NULL,  -- ID техники из справочника
    machine_hours FLOAT NOT NULL DEFAULT 8.0,  -- Отработанные машиночасы
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (equipment_id) REFERENCES equipment (id)
);

-- Создание индекса для быстрого поиска по дате
CREATE INDEX IF NOT EXISTS idx_daily_equipment_usage_date ON daily_equipment_usage(date);

-- Создание индекса для быстрого поиска по equipment_id
CREATE INDEX IF NOT EXISTS idx_daily_equipment_usage_equipment_id ON daily_equipment_usage(equipment_id);

-- Создание составного индекса для частых запросов по дате и технике
CREATE INDEX IF NOT EXISTS idx_daily_equipment_usage_date_equipment ON daily_equipment_usage(date, equipment_id);
