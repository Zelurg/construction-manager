# Справочник сотрудников и исполнителей работ

## Описание

Добавлена функциональность для управления справочником сотрудников и учета исполнителей работ за каждый рабочий день.

## Новые таблицы в БД

### `employees` - Справочник сотрудников

Таблица для хранения информации о сотрудниках:

- `id` - уникальный идентификатор
- `full_name` - ФИО сотрудника
- `position` - профессия/должность
- `is_active` - активен ли сотрудник (по умолчанию true)
- `created_at` - дата создания записи
- `updated_at` - дата последнего обновления

### `daily_executors` - Исполнители работ за день

Таблица для привязки сотрудников к конкретным датам:

- `id` - уникальный идентификатор
- `date` - дата работы
- `employee_id` - ссылка на сотрудника
- `hours_worked` - отработанные часы (по умолчанию 10.0)
- `is_responsible` - является ли ответственным (прорабом) за день
- `created_at` - дата создания записи

## Применение миграции

После получения обновлений выполните:

```bash
cd backend
python apply_employees_migration.py
```

Это создаст новые таблицы в базе данных.

## API Endpoints

### Сотрудники (`/api/employees`)

#### GET `/api/employees/`
Получить список всех сотрудников

**Query параметры:**
- `skip` (int) - количество записей для пропуска (пагинация)
- `limit` (int) - максимальное количество записей (default: 100)
- `active_only` (bool) - показывать только активных (default: true)

**Ответ:** Массив объектов Employee

#### GET `/api/employees/{employee_id}`
Получить сотрудника по ID

**Ответ:** Объект Employee

#### POST `/api/employees/`
Создать нового сотрудника

**Тело запроса:**
```json
{
  "full_name": "Иванов Иван Иванович",
  "position": "Монтажник",
  "is_active": true
}
```

**Ответ:** Созданный объект Employee

#### PUT `/api/employees/{employee_id}`
Обновить данные сотрудника

**Тело запроса:**
```json
{
  "full_name": "Иванов Иван Петрович",
  "position": "Старший монтажник"
}
```

#### DELETE `/api/employees/{employee_id}`
Удалить сотрудника (только если нет связанных записей)

#### PATCH `/api/employees/{employee_id}/deactivate`
Деактивировать сотрудника (безопасная альтернатива удалению)

#### PATCH `/api/employees/{employee_id}/activate`
Активировать сотрудника

### Исполнители (`/api/executors`)

#### GET `/api/executors/`
Получить список исполнителей за конкретную дату

**Query параметры:**
- `work_date` (date, required) - дата работы в формате YYYY-MM-DD

**Ответ:** Массив объектов DailyExecutor с вложенными данными Employee

#### GET `/api/executors/stats`
Получить статистику по исполнителям за день

**Query параметры:**
- `work_date` (date, required) - дата работы

**Ответ:**
```json
{
  "date": "2026-02-13",
  "total_hours_worked": 40.0,
  "total_labor_hours": 35.5,
  "executors_count": 4,
  "responsible": {
    "id": 1,
    "full_name": "Петров П.П.",
    "position": "Прораб"
  },
  "executors": [
    {
      "id": 1,
      "date": "2026-02-13",
      "employee_id": 2,
      "hours_worked": 10.0,
      "is_responsible": false,
      "employee": {...}
    }
  ]
}
```

**Важно:** 
- `total_hours_worked` - сколько часов отработали все исполнители
- `total_labor_hours` - сколько нормочасов по внесенным объемам работ
- Разница показывает эффективность работы

#### POST `/api/executors/`
Добавить исполнителя на день

**Тело запроса:**
```json
{
  "date": "2026-02-13",
  "employee_id": 2,
  "hours_worked": 10.0,
  "is_responsible": false
}
```

**Ограничения:**
- Нельзя добавить одного сотрудника дважды на один день
- На один день может быть только один ответственный
- Ответственный не может быть одновременно исполнителем

#### PUT `/api/executors/{executor_id}`
Обновить данные исполнителя (например, изменить часы)

**Тело запроса:**
```json
{
  "hours_worked": 8.5
}
```

#### DELETE `/api/executors/{executor_id}`
Удалить исполнителя из дня

## WebSocket события

При изменениях отправляются события:

- `executor_added` - добавлен исполнитель
- `executor_updated` - обновлены данные исполнителя  
- `executor_deleted` - удален исполнитель

## Бизнес-логика

### Добавление исполнителей

1. Сотрудник выбирается из справочника
2. По умолчанию указывается 10 часов работы
3. Можно указать ответственного (прораба) за день
4. Ответственный и исполнитель - взаимоисключающие роли

### Анализ эффективности

Система сравнивает:
- **Отработанные часы** (сумма часов всех исполнителей)
- **Трудозатраты по нормам** (сумма трудозатрат по внесенным объемам)

Если отработанные часы > трудозатрат по нормам, это может указывать на:
- Низкую производительность
- Неточные нормы трудозатрат
- Дополнительные работы, не учтенные в объемах

## Примеры использования

### Добавить сотрудника

```python
import requests

response = requests.post(
    "http://localhost:8000/api/employees/",
    json={
        "full_name": "Сидоров Сидор Сидорович",
        "position": "Сварщик",
        "is_active": True
    },
    headers={"Authorization": f"Bearer {token}"}
)
employee = response.json()
print(f"Создан сотрудник с ID: {employee['id']}")
```

### Добавить исполнителей на день

```python
from datetime import date

# Добавляем ответственного
requests.post(
    "http://localhost:8000/api/executors/",
    json={
        "date": str(date.today()),
        "employee_id": 1,  # Прораб
        "hours_worked": 10.0,
        "is_responsible": True
    },
    headers={"Authorization": f"Bearer {token}"}
)

# Добавляем исполнителей
for emp_id in [2, 3, 4]:
    requests.post(
        "http://localhost:8000/api/executors/",
        json={
            "date": str(date.today()),
            "employee_id": emp_id,
            "hours_worked": 10.0,
            "is_responsible": False
        },
        headers={"Authorization": f"Bearer {token}"}
    )
```

### Получить статистику за день

```python
response = requests.get(
    "http://localhost:8000/api/executors/stats",
    params={"work_date": "2026-02-13"},
    headers={"Authorization": f"Bearer {token}"}
)
stats = response.json()

print(f"Работало: {stats['executors_count']} человек")
print(f"Отработано: {stats['total_hours_worked']} ч/ч")
print(f"По нормам: {stats['total_labor_hours']} ч/ч")
print(f"Ответственный: {stats['responsible']['full_name']}")
```
