from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base
import enum

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
    role = Column(String, default="viewer", nullable=False)  # admin, user, viewer
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Task(Base):
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)
    name = Column(String, nullable=False)
    unit = Column(String, nullable=False)
    volume_plan = Column(Float, nullable=False)
    volume_fact = Column(Float, default=0)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    
    # Новые поля для расширенной информации
    unit_price = Column(Float, nullable=True, default=0)  # Цена за единицу
    labor_per_unit = Column(Float, nullable=True, default=0)  # Трудозатраты на единицу (чел-час)
    machine_hours_per_unit = Column(Float, nullable=True, default=0)  # Машиночасы на единицу
    executor = Column(String, nullable=True)  # Исполнитель работ
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    monthly_tasks = relationship("MonthlyTask", back_populates="task")
    daily_works = relationship("DailyWork", back_populates="task")

class MonthlyTask(Base):
    __tablename__ = "monthly_tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"))
    month = Column(Date, nullable=False)
    volume_plan = Column(Float, nullable=False)
    
    task = relationship("Task", back_populates="monthly_tasks")

class DailyWork(Base):
    __tablename__ = "daily_works"
    
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"))
    date = Column(Date, nullable=False)
    volume = Column(Float, nullable=False)
    description = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    task = relationship("Task", back_populates="daily_works")
