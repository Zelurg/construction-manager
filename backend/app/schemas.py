from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional

class TaskBase(BaseModel):
    code: str
    name: str
    unit: str
    volume_plan: float
    start_date: date
    end_date: date

class TaskCreate(TaskBase):
    pass

class Task(TaskBase):
    id: int
    volume_fact: float
    created_at: datetime
    
    class Config:
        from_attributes = True

class MonthlyTaskCreate(BaseModel):
    task_id: int
    month: date
    volume_plan: float

class MonthlyTask(MonthlyTaskCreate):
    id: int
    
    class Config:
        from_attributes = True

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
