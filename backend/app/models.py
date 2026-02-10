from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

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
