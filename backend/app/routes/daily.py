from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import date
from .. import models, schemas
from ..database import get_db
from ..websocket_manager import manager

router = APIRouter()

@router.get("/works")
def get_daily_works(work_date: date, db: Session = Depends(get_db)):
    works = db.query(models.DailyWork).filter(models.DailyWork.date == work_date).all()
    return works

@router.post("/works")
async def create_daily_work(work: schemas.DailyWorkCreate, db: Session = Depends(get_db)):
    db_work = models.DailyWork(**work.dict())
    db.add(db_work)
    db.commit()
    db.refresh(db_work)
    
    # Отправляем уведомление
    await manager.broadcast({
        "type": "daily_work_created",
        "event": "daily_works",
        "data": {
            "id": db_work.id,
            "task_id": db_work.task_id,
            "date": db_work.date.isoformat(),
            "volume": db_work.volume,
            "description": db_work.description
        }
    }, event_type="daily_works")
    
    return db_work

@router.get("/works/with-details")
def get_daily_works_with_details(work_date: date, db: Session = Depends(get_db)):
    daily_works = db.query(models.DailyWork).filter(
        models.DailyWork.date == work_date
    ).all()
    
    result = []
    for dw in daily_works:
        task = db.query(models.Task).filter(models.Task.id == dw.task_id).first()
        result.append({
            "id": dw.id,
            "task_id": dw.task_id,
            "code": task.code,
            "name": task.name,
            "unit": task.unit,
            "volume": dw.volume,
            "description": dw.description
        })
    
    return result
