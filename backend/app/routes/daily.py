from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
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
    # Проверяем существование задачи
    task = db.query(models.Task).filter(models.Task.id == work.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    
    # Создаём запись ежедневной работы
    db_work = models.DailyWork(**work.dict())
    db.add(db_work)
    db.commit()
    db.refresh(db_work)
    
    # ТЕПЕРЬ пересчитываем volume_fact ПОСЛЕ commit
    # Так мы учтём ВСЕ записи DailyWork включая только что добавленную
    total_volume = db.query(func.sum(models.DailyWork.volume)).filter(
        models.DailyWork.task_id == work.task_id
    ).scalar() or 0
    
    # Просто присваиваем общую сумму (БЕЗ + work.volume!)
    task.volume_fact = total_volume
    
    db.commit()
    db.refresh(task)
    
    # Отправляем уведомление о создании работы
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
    
    # Отправляем уведомление об обновлении задачи для синхронизации всех вкладок
    await manager.broadcast({
        "type": "task_updated",
        "event": "tasks",
        "data": {
            "id": task.id,
            "code": task.code,
            "name": task.name,
            "unit": task.unit,
            "volume_plan": task.volume_plan,
            "volume_fact": task.volume_fact,
            "start_date_plan": task.start_date_plan.isoformat() if task.start_date_plan else None,
            "end_date_plan": task.end_date_plan.isoformat() if task.end_date_plan else None
        }
    }, event_type="tasks")
    
    return db_work

@router.get("/works/with-details")
def get_daily_works_with_details(work_date: date, db: Session = Depends(get_db)):
    daily_works = db.query(models.DailyWork).filter(
        models.DailyWork.date == work_date
    ).all()
    
    result = []
    for dw in daily_works:
        task = db.query(models.Task).filter(models.Task.id == dw.task_id).first()
        if task:
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
