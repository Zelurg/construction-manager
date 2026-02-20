from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional, List


# ─── Project ────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    address: Optional[str] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    address: Optional[str] = None
    is_archived: Optional[bool] = None

class Project(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    address: Optional[str] = None
    is_archived: bool
    updated_at: datetime
    created_at: datetime
    class Config:
        from_attributes = True


# ─── Task ───────────────────────────────────────────────────────────────────

class TaskBase(BaseModel):
    code: str
    name: str
    unit: Optional[str] = None
    volume_plan: Optional[float] = 0
    volume_fact: Optional[float] = 0
    start_date_contract: Optional[date] = None
    end_date_contract: Optional[date] = None
    start_date_plan: Optional[date] = None
    end_date_plan: Optional[date] = None
    unit_price: Optional[float] = 0
    labor_per_unit: Optional[float] = 0
    machine_hours_per_unit: Optional[float] = 0
    executor: Optional[str] = None
    is_section: Optional[bool] = False
    level: Optional[int] = 0
    parent_code: Optional[str] = None
    is_custom: Optional[bool] = False
    sort_order: Optional[int] = 0

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    unit: Optional[str] = None
    volume_plan: Optional[float] = None
    volume_fact: Optional[float] = None
    start_date_contract: Optional[date] = None
    end_date_contract: Optional[date] = None
    start_date_plan: Optional[date] = None
    end_date_plan: Optional[date] = None
    unit_price: Optional[float] = None
    labor_per_unit: Optional[float] = None
    machine_hours_per_unit: Optional[float] = None
    executor: Optional[str] = None
    is_section: Optional[bool] = None
    level: Optional[int] = None
    parent_code: Optional[str] = None
    is_custom: Optional[bool] = None
    sort_order: Optional[int] = None

class Task(TaskBase):
    id: int
    project_id: Optional[int] = None
    class Config:
        from_attributes = True


# ─── CustomTaskCreate ───────────────────────────────────────────────────────

class CustomTaskCreate(BaseModel):
    name: str = Field(default="Новая работа", min_length=1)
    unit: Optional[str] = None
    volume_plan: Optional[float] = 0
    start_date_plan: Optional[date] = None
    end_date_plan: Optional[date] = None
    unit_price: Optional[float] = 0
    labor_per_unit: Optional[float] = 0
    machine_hours_per_unit: Optional[float] = 0
    executor: Optional[str] = None
    parent_code: Optional[str] = None
    # Вставить ПЕРЕД этой задачей
    insert_before_task_id: Optional[int] = None
    # Вставить ПОСЛЕ этой задачи
    insert_after_task_id: Optional[int] = None


# ─── MonthlyTask ────────────────────────────────────────────────────────────

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


# ─── Brigade ────────────────────────────────────────────────────────────────

class BrigadeCreate(BaseModel):
    date: date
    name: str = Field(default="Бригада", min_length=1)
    project_id: Optional[int] = None

class BrigadeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)

class Brigade(BaseModel):
    id: int
    date: date
    name: str
    order: int
    project_id: Optional[int] = None
    created_at: datetime
    class Config:
        from_attributes = True


# ─── DailyWork ──────────────────────────────────────────────────────────────

class DailyWorkBase(BaseModel):
    task_id: Optional[int] = None
    date: date
    volume: float
    description: Optional[str] = None
    brigade_id: Optional[int] = None
    is_ancillary: bool = False

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


# ─── Analytics ──────────────────────────────────────────────────────────────

class Analytics(BaseModel):
    total_progress_percent: float
    time_progress_percent: float
    labor_plan: float
    labor_fact: float
    labor_remaining: float
    machine_hours_plan: float
    machine_hours_fact: float
    machine_hours_remaining: float
    cost_plan: float
    cost_fact: float
    cost_remaining: float


# ─── Auth / Users ───────────────────────────────────────────────────────────

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


# ─── Employee ───────────────────────────────────────────────────────────────

class EmployeeBase(BaseModel):
    full_name: str = Field(..., min_length=1)
    position: str = Field(..., min_length=1)
    is_active: bool = Field(default=True)

class EmployeeCreate(EmployeeBase):
    pass

class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1)
    position: Optional[str] = Field(default=None, min_length=1)
    is_active: Optional[bool] = Field(default=None)

class Employee(EmployeeBase):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


# ─── DailyExecutor ──────────────────────────────────────────────────────────

class DailyExecutorBase(BaseModel):
    date: date
    employee_id: int = Field(..., gt=0)
    hours_worked: float = Field(default=10.0, gt=0, le=24)
    is_responsible: bool = Field(default=False)
    brigade_id: Optional[int] = None

class DailyExecutorCreate(DailyExecutorBase):
    pass

class DailyExecutorUpdate(BaseModel):
    hours_worked: Optional[float] = Field(default=None, gt=0, le=24)
    is_responsible: Optional[bool] = Field(default=None)

class DailyExecutor(DailyExecutorBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True

class DailyExecutorWithEmployee(DailyExecutor):
    employee: Employee

class DailyExecutorStats(BaseModel):
    date: date
    total_hours_worked: float
    total_labor_hours: float
    executors_count: int
    responsible: Optional[Employee] = None
    executors: List[DailyExecutorWithEmployee]


# ─── Equipment ──────────────────────────────────────────────────────────────

class EquipmentBase(BaseModel):
    equipment_type: str = Field(..., min_length=1)
    model: str = Field(..., min_length=1)
    registration_number: str = Field(..., min_length=1)
    is_active: bool = Field(default=True)

class EquipmentCreate(EquipmentBase):
    pass

class EquipmentUpdate(BaseModel):
    equipment_type: Optional[str] = Field(default=None, min_length=1)
    model: Optional[str] = Field(default=None, min_length=1)
    registration_number: Optional[str] = Field(default=None, min_length=1)
    is_active: Optional[bool] = Field(default=None)

class Equipment(EquipmentBase):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


# ─── DailyEquipmentUsage ────────────────────────────────────────────────────

class DailyEquipmentUsageBase(BaseModel):
    date: date
    equipment_id: int = Field(..., gt=0)
    machine_hours: float = Field(default=8.0, gt=0, le=24)
    brigade_id: Optional[int] = None

class DailyEquipmentUsageCreate(DailyEquipmentUsageBase):
    pass

class DailyEquipmentUsageUpdate(BaseModel):
    machine_hours: Optional[float] = Field(default=None, gt=0, le=24)

class DailyEquipmentUsage(DailyEquipmentUsageBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True

class DailyEquipmentUsageWithEquipment(DailyEquipmentUsage):
    equipment: Equipment

class DailyEquipmentStats(BaseModel):
    date: date
    total_machine_hours: float
    total_work_machine_hours: float
    equipment_count: int
    equipment_usage: List[DailyEquipmentUsageWithEquipment]


# ─── BrigadeStats ───────────────────────────────────────────────────────────

class BrigadeStats(BaseModel):
    brigade: Brigade
    executors_count: int
    total_hours_worked: float
    total_labor_hours: float
    responsible: Optional[Employee] = None
    executors: List[DailyExecutorWithEmployee]
    equipment_count: int
    total_machine_hours: float
    equipment_usage: List[DailyEquipmentUsageWithEquipment]
    works: List[dict]
    ancillary_works: List[dict]
    total_ancillary_hours: float
