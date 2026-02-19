from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user
from .projects import touch_project

router = APIRouter()


@router.get("/", response_model=List[schemas.MonthlyTask])
def get_monthly_tasks(
    month: Optional[date] = None,
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(models.MonthlyTask)
    if month:
        query = query.filter(models.MonthlyTask.month == month)
    if project_id is not None:
        query = query.join(models.Task).filter(models.Task.project_id == project_id)
    return query.all()


@router.post("/", response_model=schemas.MonthlyTask)
def create_monthly_task(
    monthly_task: schemas.MonthlyTaskCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    task = db.query(models.Task).filter(models.Task.id == monthly_task.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    existing = db.query(models.MonthlyTask).filter(
        models.MonthlyTask.task_id == monthly_task.task_id,
        models.MonthlyTask.month == monthly_task.month
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Месячный план для этой задачи уже существует")

    db_monthly = models.MonthlyTask(**monthly_task.dict())
    db.add(db_monthly)
    db.commit()
    db.refresh(db_monthly)
    touch_project(task.project_id, db)
    return db_monthly


@router.put("/{monthly_id}", response_model=schemas.MonthlyTask)
def update_monthly_task(
    monthly_id: int,
    monthly_task: schemas.MonthlyTaskCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_monthly = db.query(models.MonthlyTask).filter(models.MonthlyTask.id == monthly_id).first()
    if not db_monthly:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    task = db.query(models.Task).filter(models.Task.id == db_monthly.task_id).first()
    for key, value in monthly_task.dict().items():
        setattr(db_monthly, key, value)
    db.commit()
    db.refresh(db_monthly)
    if task:
        touch_project(task.project_id, db)
    return db_monthly


@router.delete("/{monthly_id}")
def delete_monthly_task(
    monthly_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_monthly = db.query(models.MonthlyTask).filter(models.MonthlyTask.id == monthly_id).first()
    if not db_monthly:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    task = db.query(models.Task).filter(models.Task.id == db_monthly.task_id).first()
    db.delete(db_monthly)
    db.commit()
    if task:
        touch_project(task.project_id, db)
    return {"message": "Запись удалена", "id": monthly_id}
