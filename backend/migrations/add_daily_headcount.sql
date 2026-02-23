-- Миграция: таблица планирования людей по дням (МСГ)
CREATE TABLE IF NOT EXISTS daily_headcount (
    id          SERIAL PRIMARY KEY,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    headcount   INTEGER NOT NULL CHECK (headcount > 0),
    project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_daily_headcount_task_date UNIQUE (task_id, date)
);

CREATE INDEX IF NOT EXISTS ix_daily_headcount_task_id   ON daily_headcount(task_id);
CREATE INDEX IF NOT EXISTS ix_daily_headcount_date      ON daily_headcount(date);
CREATE INDEX IF NOT EXISTS ix_daily_headcount_project_id ON daily_headcount(project_id);
