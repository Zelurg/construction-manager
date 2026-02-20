from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, DateTime, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base
import enum


class Project(Base):
    """Строительный объект"""
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    address = Column(String, nullable=True)
    is_archived = Column(Boolean, default=False, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    tasks = relationship("Task", back_populates="project")
    brigades = relationship("Brigade", back_populates="project")


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"
    viewer = "viewer"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="viewer", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint('project_id', 'code', name='uq_tasks_project_code'),
    )

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    code = Column(String, index=True)
    name = Column(String, nullable=False)
    unit = Column(String, nullable=True)
    volume_plan = Column(Float, nullable=True, default=0)
    volume_fact = Column(Float, default=0)
    start_date_contract = Column(Date, nullable=True)
    end_date_contract = Column(Date, nullable=True)
    start_date_plan = Column(Date, nullable=True)
    end_date_plan = Column(Date, nullable=True)
    unit_price = Column(Float, nullable=True, default=0)
    labor_per_unit = Column(Float, nullable=True, default=0)
    machine_hours_per_unit = Column(Float, nullable=True, default=0)
    executor = Column(String, nullable=True)
    is_section = Column(Boolean, default=False, nullable=False)
    level = Column(Integer, default=0, nullable=False)
    parent_code = Column(String, nullable=True)
    is_custom = Column(Boolean, default=False, nullable=False)
    # server_default гарантирует DEFAULT 0 на уровне Postgres,
    # чтобы существующие строки без этого поля не давали NULL и 500.
    sort_order = Column(Integer, default=0, server_default='0', nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="tasks")
    monthly_tasks = relationship("MonthlyTask", back_populates="task")
    daily_works = relationship("DailyWork", back_populates="task")


class MonthlyTask(Base):
    __tablename__ = "monthly_tasks"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"))
    month = Column(Date, nullable=False)
    volume_plan = Column(Float, nullable=False)
    task = relationship("Task", back_populates="monthly_tasks")


class Brigade(Base):
    """Бригада/звено за конкретный день"""
    __tablename__ = "brigades"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    date = Column(Date, nullable=False, index=True)
    name = Column(String, nullable=False, default="Бригада")
    order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="brigades")
    daily_works = relationship("DailyWork", back_populates="brigade")
    daily_executors = relationship("DailyExecutor", back_populates="brigade")
    daily_equipment_usage = relationship("DailyEquipmentUsage", back_populates="brigade")


class DailyWork(Base):
    __tablename__ = "daily_works"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    date = Column(Date, nullable=False)
    volume = Column(Float, nullable=False)
    description = Column(String, nullable=True)
    brigade_id = Column(Integer, ForeignKey("brigades.id"), nullable=True)
    is_ancillary = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("Task", back_populates="daily_works")
    brigade = relationship("Brigade", back_populates="daily_works")


class Employee(Base):
    """Справочник сотрудников (глобальный)"""
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    position = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    daily_executors = relationship("DailyExecutor", back_populates="employee")


class DailyExecutor(Base):
    """Исполнитель работ за конкретный день"""
    __tablename__ = "daily_executors"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    hours_worked = Column(Float, nullable=False, default=10.0)
    is_responsible = Column(Boolean, default=False, nullable=False)
    brigade_id = Column(Integer, ForeignKey("brigades.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", back_populates="daily_executors")
    brigade = relationship("Brigade", back_populates="daily_executors")


class Equipment(Base):
    """Справочник техники (глобальный)"""
    __tablename__ = "equipment"
    id = Column(Integer, primary_key=True, index=True)
    equipment_type = Column(String, nullable=False)
    model = Column(String, nullable=False)
    registration_number = Column(String, nullable=False, unique=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    daily_equipment_usage = relationship("DailyEquipmentUsage", back_populates="equipment")


class DailyEquipmentUsage(Base):
    """Использование техники за конкретный день"""
    __tablename__ = "daily_equipment_usage"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False)
    machine_hours = Column(Float, nullable=False, default=8.0)
    brigade_id = Column(Integer, ForeignKey("brigades.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    equipment = relationship("Equipment", back_populates="daily_equipment_usage")
    brigade = relationship("Brigade", back_populates="daily_equipment_usage")
