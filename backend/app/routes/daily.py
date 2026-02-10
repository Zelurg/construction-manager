from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import date
from .. import models, schemas
from ..database import get_db

router = APIRouter()

@router.get("/works", response_model=List[schemas.DailyWork])
def get_daily_works(work_date: date, db: Session = Depends(get_db)):
    works = db.query(models.DailyWork).filter(models.DailyWork.date == work_date).all()
    return works

@router.post("/works", response_model=schemas.DailyWork)
def create_daily_work(work: schemas.DailyWorkCreate, db: Session = Depends(get_db)):
    db_work = models.DailyWork(**work.dict())
    db.add(db_work)
    
    # Update task volume_fact
    total_volume = db.query(func.sum(models.DailyWork.volume)).filter(
        models.DailyWork.task_id == work.task_id
    ).scalar() or 0
    total_volume += work.volume
    
    task = db.query(models.Task).filter(models.Task.id == work.task_id).first()
    if task:
        task.volume_fact = total_volume
    
    db.commit()
    db.refresh(db_work)
    return db_work

@router.get("/works/with-details")
def get_daily_works_with_details(work_date: date, db: Session = Depends(get_db)):
    works = db.query(models.DailyWork).filter(models.DailyWork.date == work_date).all()
    
    result = []
    for work in works:
        task = db.query(models.Task).filter(models.Task.id == work.task_id).first()
        result.append({
            "id": work.id,
            "task_id": work.task_id,
            "code": task.code,
            "name": task.name,
            "unit": task.unit,
            "volume": work.volume,
            "description": work.description,
            "date": work.date
        })
    
    return result
