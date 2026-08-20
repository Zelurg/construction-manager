from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from typing import List, Optional
from datetime import date
from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user
from ..websocket_manager import manager
from .projects import touch_project

router = APIRouter()


def _recalc_volume_fact(task_id: int, db: Session):
    """Пересчитать volume_fact задачи по всем её ежедневным работам."""
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        return None
    total = db.query(func.sum(models.DailyWork.volume)).filter(
        models.DailyWork.task_id == task_id,
        models.DailyWork.is_ancillary == False
    ).scalar() or 0
    task.volume_fact = total
    db.commit()
    db.refresh(task)
    return task


def _broadcast_task_volume(task: models.Task):
    """Разослать обновлённый volume_fact задачи всем клиентам."""
    if not task:
        return
    return {
        "id": task.id,
        "code": task.code,
        "name": task.name,
        "unit": task.unit,
        "volume_plan": task.volume_plan,
        "volume_fact": task.volume_fact,
        "start_date_plan": task.start_date_plan.isoformat() if task.start_date_plan else None,
        "end_date_plan": task.end_date_plan.isoformat() if task.end_date_plan else None,
    }


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


# ─── Ручные объёмы работ по датам (вводятся на диаграмме Ганта во вкладке МСГ) ───

@router.get("/volumes")
def get_daily_volumes(
    project_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Получить ручные объёмы работ по датам (brigade_id IS NULL).
    Фильтрация по проекту и/или году/месяцу.
    """
    q = db.query(models.DailyWork).filter(
        models.DailyWork.brigade_id.is_(None),
        models.DailyWork.is_ancillary == False,
        models.DailyWork.task_id.isnot(None),
    )
    if project_id is not None:
        q = q.join(models.Task, models.Task.id == models.DailyWork.task_id).filter(
            models.Task.project_id == project_id
        )
    if year is not None:
        q = q.filter(extract('year', models.DailyWork.date) == int(year))
    if month is not None:
        q = q.filter(extract('month', models.DailyWork.date) == int(month))
    return [
        {"task_id": w.task_id, "date": w.date.isoformat(), "volume": w.volume}
        for w in q.order_by(models.DailyWork.date).all()
    ]


@router.post("/volumes/upsert", response_model=schemas.DailyWork)
async def upsert_daily_volume(
    payload: schemas.DailyVolumeUpsert,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Создать или обновить ручной объём работы за конкретную дату (ячейка Ганта МСГ)."""
    task = db.query(models.Task).filter(models.Task.id == payload.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    existing = db.query(models.DailyWork).filter(
        models.DailyWork.task_id == payload.task_id,
        models.DailyWork.date == payload.date,
        models.DailyWork.is_ancillary == False,
        models.DailyWork.brigade_id.is_(None),
    ).first()

    if existing:
        existing.volume = payload.volume
        db_work = existing
        event_type = "daily_work_updated"
    else:
        db_work = models.DailyWork(
            task_id=payload.task_id,
            date=payload.date,
            volume=payload.volume,
            is_ancillary=False,
        )
        db.add(db_work)
        event_type = "daily_work_created"

    db.commit()
    db.refresh(db_work)

    updated_task = _recalc_volume_fact(payload.task_id, db)
    touch_project(updated_task.project_id if updated_task else None, db)

    await manager.broadcast({
        "type": event_type, "event": "daily_works",
        "data": {
            "id": db_work.id,
            "task_id": db_work.task_id,
            "date": db_work.date.isoformat(),
            "volume": db_work.volume,
            "is_ancillary": False,
        }
    }, event_type="daily_works")

    if updated_task:
        await manager.broadcast({
            "type": "task_updated",
            "event": "tasks",
            "data": _broadcast_task_volume(updated_task),
        }, event_type="tasks")

    return db_work


@router.delete("/volumes/one")
async def delete_daily_volume(
    task_id: int = Query(...),
    date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Удалить ручной объём работы за конкретную дату (очистка ячейки Ганта)."""
    work = db.query(models.DailyWork).filter(
        models.DailyWork.task_id == task_id,
        models.DailyWork.date == date,
        models.DailyWork.is_ancillary == False,
        models.DailyWork.brigade_id.is_(None),
    ).first()
    if not work:
        return {"deleted": 0}

    work_data = {
        "id": work.id,
        "task_id": task_id,
        "date": date.isoformat(),
    }
    db.delete(work)
    db.commit()

    updated_task = _recalc_volume_fact(task_id, db)
    touch_project(updated_task.project_id if updated_task else None, db)

    await manager.broadcast({
        "type": "daily_work_deleted",
        "event": "daily_works",
        "data": work_data,
    }, event_type="daily_works")

    if updated_task:
        await manager.broadcast({
            "type": "task_updated",
            "event": "tasks",
            "data": _broadcast_task_volume(updated_task),
        }, event_type="tasks")

    return {"deleted": 1}


@router.delete("/volumes/orphaned")
async def delete_orphaned_volumes(
    project_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Удалить ручные объёмы, чьи даты не попадают в текущий диапазон плановых дат
    задачи (start_date_plan..end_date_plan) или у задачи нет плановых дат.
    Используется, когда после изменения дат «Старт план/Финиш план» на диаграмме
    ранее введённые ячейки выпали из диапазона.
    """
    q = db.query(models.DailyWork).join(models.Task).filter(
        models.DailyWork.brigade_id.is_(None),
        models.DailyWork.is_ancillary == False,
        models.DailyWork.task_id.isnot(None),
    )
    if project_id is not None:
        q = q.filter(models.Task.project_id == project_id)
    if year is not None:
        q = q.filter(extract('year', models.DailyWork.date) == int(year))
    if month is not None:
        q = q.filter(extract('month', models.DailyWork.date) == int(month))

    works = q.all()
    orphaned = []
    affected = set()
    for w in works:
        s = w.task.start_date_plan
        e = w.task.end_date_plan
        if not s or not e or w.date < s or w.date > e:
            orphaned.append(w)
            affected.add(w.task_id)

    for w in orphaned:
        db.delete(w)
    db.commit()

    touched_projects = set()
    for task_id in affected:
        task = _recalc_volume_fact(task_id, db)
        if task:
            if task.project_id:
                touched_projects.add(task.project_id)
            await manager.broadcast({
                "type": "task_updated",
                "event": "tasks",
                "data": _broadcast_task_volume(task),
            }, event_type="tasks")

    for pid in touched_projects:
        touch_project(pid, db)

    return {"deleted": len(orphaned)}
