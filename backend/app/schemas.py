from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional, List

class TaskBase(BaseModel):
    code: str
    name: str
    unit: Optional[str] = None  # Опционально для разделов
    volume_plan: Optional[float] = 0
    volume_fact: Optional[float] = 0
    # Контрактные даты
    start_date_contract: Optional[date] = None
    end_date_contract: Optional[date] = None
    # Плановые даты
    start_date_plan: Optional[date] = None
    end_date_plan: Optional[date] = None
    # Дополнительные поля
    unit_price: Optional[float] = 0
    labor_per_unit: Optional[float] = 0
    machine_hours_per_unit: Optional[float] = 0
    executor: Optional[str] = None
    is_section: Optional[bool] = False
    level: Optional[int] = 0
    parent_code: Optional[str] = None

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    unit: Optional[str] = None
    volume_plan: Optional[float] = None
    volume_fact: Optional[float] = None
    # Контрактные даты
    start_date_contract: Optional[date] = None
    end_date_contract: Optional[date] = None
    # Плановые даты
    start_date_plan: Optional[date] = None
    end_date_plan: Optional[date] = None
    # Дополнительные поля
    unit_price: Optional[float] = None
    labor_per_unit: Optional[float] = None
    machine_hours_per_unit: Optional[float] = None
    executor: Optional[str] = None
    is_section: Optional[bool] = None
    level: Optional[int] = None
    parent_code: Optional[str] = None

class Task(TaskBase):
    id: int

    class Config:
        from_attributes = True

class MonthlyTaskBase(BaseModel):
    task_id: int
    month: date
    volume_plan: float

class MonthlyTaskCreate(MonthlyTaskBase):
    pass

class MonthlyTask(MonthlyTaskBase):
    id: int

    class Config:
        from_attributes = True

class DailyWorkBase(BaseModel):
    task_id: int
    date: date
    volume: float
    description: Optional[str] = None

class DailyWorkCreate(DailyWorkBase):
    pass

class DailyWork(DailyWorkBase):
    id: int

    class Config:
        from_attributes = True

class DailyWorkWithTask(DailyWork):
    code: str
    name: str
    unit: str

# Analytics schema - расширенная версия
class Analytics(BaseModel):
    total_progress_percent: float
    time_progress_percent: float
    # Трудозатраты
    labor_plan: float
    labor_fact: float
    labor_remaining: float
    # Машиночасы
    machine_hours_plan: float
    machine_hours_fact: float
    machine_hours_remaining: float
    # Стоимость
    cost_plan: float
    cost_fact: float
    cost_remaining: float

# Auth schemas
class UserBase(BaseModel):
    username: str
    email: str
    full_name: str
    role: str = "viewer"

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True

class User(UserBase):
    id: int

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: Optional[UserResponse] = None

class TokenData(BaseModel):
    username: Optional[str] = None

class ImportResult(BaseModel):
    tasks_processed: int
    errors: List[str] = []

# Employee schemas - новые схемы для сотрудников
class EmployeeBase(BaseModel):
    full_name: str = Field(..., min_length=1, description="ФИО сотрудника")
    position: str = Field(..., min_length=1, description="Профессия/должность")
    is_active: bool = Field(default=True, description="Активен ли сотрудник")

class EmployeeCreate(EmployeeBase):
    pass

class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, description="ФИО сотрудника")
    position: Optional[str] = Field(default=None, min_length=1, description="Профессия/должность")
    is_active: Optional[bool] = Field(default=None, description="Активен ли сотрудник")

class Employee(EmployeeBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# DailyExecutor schemas - схемы для исполнителей работ за день
class DailyExecutorBase(BaseModel):
    date: date = Field(..., description="Дата работы")
    employee_id: int = Field(..., gt=0, description="ID сотрудника")
    hours_worked: float = Field(default=10.0, gt=0, le=24, description="Отработанные часы")
    is_responsible: bool = Field(default=False, description="Является ли ответственным")

class DailyExecutorCreate(DailyExecutorBase):
    pass

class DailyExecutorUpdate(BaseModel):
    hours_worked: Optional[float] = Field(default=None, gt=0, le=24, description="Отработанные часы")
    is_responsible: Optional[bool] = Field(default=None, description="Является ли ответственным")

class DailyExecutor(DailyExecutorBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# Расширенная схема с информацией о сотруднике
class DailyExecutorWithEmployee(DailyExecutor):
    employee: Employee

# Схема для получения статистики по дню
class DailyExecutorStats(BaseModel):
    date: date
    total_hours_worked: float
    total_labor_hours: float
    executors_count: int
    responsible: Optional[Employee] = None
    executors: List[DailyExecutorWithEmployee]
