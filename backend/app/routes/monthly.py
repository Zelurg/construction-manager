from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import date
from .. import models, schemas
from ..database import get_db

router = APIRouter()

@router.get("/tasks", response_model=List[schemas.MonthlyTask])
def get_monthly_tasks(month: date, db: Session = Depends(get_db)):
    tasks = db.query(models.MonthlyTask).filter(models.MonthlyTask.month == month).all()
    return tasks

@router.post("/tasks", response_model=schemas.MonthlyTask)
def create_monthly_task(task: schemas.MonthlyTaskCreate, db: Session = Depends(get_db)):
    db_task = models.MonthlyTask(**task.dict())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

@router.get("/tasks/with-details")
def get_monthly_tasks_with_details(month: date, db: Session = Depends(get_db)):
    monthly_tasks = db.query(models.MonthlyTask).filter(
        models.MonthlyTask.month == month
    ).all()
    
    result = []
    for mt in monthly_tasks:
        task = db.query(models.Task).filter(models.Task.id == mt.task_id).first()
        result.append({
            "id": mt.id,
            "task_id": mt.task_id,
            "code": task.code,
            "name": task.name,
            "unit": task.unit,
            "volume_plan": mt.volume_plan,
            "volume_fact": task.volume_fact,
            "start_date": task.start_date,
            "end_date": task.end_date
        })
    
    return result
