from pydantic import BaseModel, EmailStr
from datetime import date, datetime
from typing import Optional

# =====================================================
# Существующие схемы для Task
# =====================================================

class TaskBase(BaseModel):
    code: str
    name: str
    unit: str
    volume_plan: float
    start_date: date
    end_date: date
    # Новые поля
    unit_price: Optional[float] = 0
    labor_per_unit: Optional[float] = 0
    machine_hours_per_unit: Optional[float] = 0
    executor: Optional[str] = None

class TaskCreate(TaskBase):
    pass

class Task(TaskBase):
    id: int
    volume_fact: float
    created_at: datetime
    
    class Config:
        from_attributes = True

# =====================================================
# Существующие схемы для MonthlyTask
# =====================================================

class MonthlyTaskCreate(BaseModel):
    task_id: int
    month: date
    volume_plan: float

class MonthlyTask(MonthlyTaskCreate):
    id: int
    
    class Config:
        from_attributes = True

# =====================================================
# Существующие схемы для DailyWork
# =====================================================

class DailyWorkCreate(BaseModel):
    task_id: int
    date: date
    volume: float
    description: Optional[str] = None

class DailyWork(DailyWorkCreate):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class Analytics(BaseModel):
    total_progress_percent: float
    time_progress_percent: float
    labor_plan: float
    labor_fact: float
    labor_remaining: float

# =====================================================
# НОВЫЕ СХЕМЫ ДЛЯ ПОЛЬЗОВАТЕЛЕЙ И АВТОРИЗАЦИИ
# =====================================================

class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: str

class UserCreate(UserBase):
    password: str
    role: Optional[str] = "viewer"  # admin, user, viewer

class UserLogin(BaseModel):
    username: str
    password: str

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None

class UserResponse(UserBase):
    id: int
    role: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None
