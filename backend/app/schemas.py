from pydantic import BaseModel, Field
from datetime import date
from typing import Optional, List

class TaskBase(BaseModel):
    code: str
    name: str
    unit: Optional[str] = None  # Опционально для разделов
    volume_plan: Optional[float] = 0
    volume_fact: Optional[float] = 0
    start_date: Optional[date] = None  # Опционально для разделов
    end_date: Optional[date] = None  # Опционально для разделов
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
    start_date: Optional[date] = None
    end_date: Optional[date] = None
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

# Analytics schema
class Analytics(BaseModel):
    total_progress_percent: float
    time_progress_percent: float
    labor_plan: float
    labor_fact: float
    labor_remaining: float

# Auth schemas
class UserBase(BaseModel):
    username: str
    email: str
    full_name: str
    role: str = "viewer"

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str

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
