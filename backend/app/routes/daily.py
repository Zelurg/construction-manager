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
    """
    Создать запись о выполненной работе за день.
    Для сопутствующих работ (is_ancillary=True):
      - task_id не нужен (None)
      - volume = человекочасы
      - volume_fact задачи НЕ обновляется
    """
    if work.is_ancillary:
        # Сопутствующие работы — без привязки к задаче
        db_work = models.DailyWork(
            task_id=None,
            date=work.date,
            volume=work.volume,
            description=work.description,
            brigade_id=work.brigade_id,
            is_ancillary=True,
        )
        db.add(db_work)
        db.commit()
        db.refresh(db_work)

        await manager.broadcast({
            "type": "daily_work_created",
            "event": "daily_works",
            "data": {
                "id": db_work.id,
                "task_id": None,
                "date": db_work.date.isoformat(),
                "volume": db_work.volume,
                "description": db_work.description,
                "is_ancillary": True,
            }
        }, event_type="daily_works")

        return db_work

    # Обычная работа — требует task_id
    if not work.task_id:
        raise HTTPException(status_code=400, detail="task_id обязателен для обычных работ")

    task = db.query(models.Task).filter(models.Task.id == work.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    db_work = models.DailyWork(
        task_id=work.task_id,
        date=work.date,
        volume=work.volume,
        description=work.description,
        brigade_id=work.brigade_id,
        is_ancillary=False,
    )
    db.add(db_work)
    db.commit()
    db.refresh(db_work)

    # Пересчитываем volume_fact только для обычных работ
    total_volume = db.query(func.sum(models.DailyWork.volume)).filter(
        models.DailyWork.task_id == work.task_id,
        models.DailyWork.is_ancillary == False
    ).scalar() or 0
    task.volume_fact = total_volume
    db.commit()
    db.refresh(task)

    await manager.broadcast({
        "type": "daily_work_created",
        "event": "daily_works",
        "data": {
            "id": db_work.id,
            "task_id": db_work.task_id,
            "date": db_work.date.isoformat(),
            "volume": db_work.volume,
            "description": db_work.description,
            "is_ancillary": False,
        }
    }, event_type="daily_works")

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
        if dw.is_ancillary:
            result.append({
                "id": dw.id,
                "task_id": None,
                "is_ancillary": True,
                "code": None,
                "name": "Сопутствующие работы",
                "unit": "ч/ч",
                "volume": dw.volume,
                "description": dw.description,
                "brigade_id": dw.brigade_id,
            })
        else:
            task = db.query(models.Task).filter(models.Task.id == dw.task_id).first()
            if task:
                result.append({
                    "id": dw.id,
                    "task_id": dw.task_id,
                    "is_ancillary": False,
                    "code": task.code,
                    "name": task.name,
                    "unit": task.unit,
                    "volume": dw.volume,
                    "description": dw.description,
                    "brigade_id": dw.brigade_id,
                })

    return result
