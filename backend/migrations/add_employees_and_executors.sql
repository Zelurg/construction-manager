-- Migration: Add employees and daily_executors tables
-- Date: 2026-02-13
-- Description: Adds tables for employee directory and daily work executors

-- Create employees table (справочник сотрудников)
CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    position TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on full_name for faster search
CREATE INDEX IF NOT EXISTS idx_employees_full_name ON employees(full_name);
CREATE INDEX IF NOT EXISTS idx_employees_is_active ON employees(is_active);

-- Create daily_executors table (исполнители работ за конкретный день)
CREATE TABLE IF NOT EXISTS daily_executors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    employee_id INTEGER NOT NULL,
    hours_worked REAL NOT NULL DEFAULT 10.0,
    is_responsible BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Create indexes for daily_executors
CREATE INDEX IF NOT EXISTS idx_daily_executors_date ON daily_executors(date);
CREATE INDEX IF NOT EXISTS idx_daily_executors_employee_id ON daily_executors(employee_id);
CREATE INDEX IF NOT EXISTS idx_daily_executors_date_employee ON daily_executors(date, employee_id);

-- Create unique constraint: only one responsible per day
-- This is implemented in application logic, not as DB constraint
-- to allow flexibility in data management

-- Comments for clarity
-- employees: Справочник сотрудников с ФИО и профессией
-- daily_executors: Исполнители работ за конкретную дату
--   - date: дата работы
--   - employee_id: ссылка на сотрудника
--   - hours_worked: отработанные часы (по умолчанию 10)
--   - is_responsible: является ли ответственным (прорабом) за день
