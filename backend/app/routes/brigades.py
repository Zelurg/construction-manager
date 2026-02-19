from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import date
from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user
from ..websocket_manager import manager

router = APIRouter()


@router.get("/", response_model=List[schemas.Brigade])
def get_brigades(work_date: date, db: Session = Depends(get_db)):
    """Получить список бригад за дату"""
    brigades = db.query(models.Brigade).filter(
        models.Brigade.date == work_date
    ).order_by(models.Brigade.order).all()
    return brigades


@router.post("/", response_model=schemas.Brigade)
async def create_brigade(
    brigade: schemas.BrigadeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Создать новую бригаду на день"""
    # Определяем порядок (следующий после максимального)
    max_order = db.query(func.max(models.Brigade.order)).filter(
        models.Brigade.date == brigade.date
    ).scalar() or 0

    db_brigade = models.Brigade(
        date=brigade.date,
        name=brigade.name,
        order=max_order + 1
    )
    db.add(db_brigade)
    db.commit()
    db.refresh(db_brigade)

    await manager.broadcast({
        "type": "brigade_created",
        "event": "brigades",
        "data": {"id": db_brigade.id, "date": db_brigade.date.isoformat(), "name": db_brigade.name}
    }, event_type="brigades")

    return db_brigade


@router.put("/{brigade_id}", response_model=schemas.Brigade)
async def update_brigade(
    brigade_id: int,
    brigade: schemas.BrigadeUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Переименовать бригаду"""
    db_brigade = db.query(models.Brigade).filter(models.Brigade.id == brigade_id).first()
    if not db_brigade:
        raise HTTPException(status_code=404, detail="Бригада не найдена")

    if brigade.name is not None:
        db_brigade.name = brigade.name
    db.commit()
    db.refresh(db_brigade)

    await manager.broadcast({
        "type": "brigade_updated",
        "event": "brigades",
        "data": {"id": db_brigade.id, "name": db_brigade.name}
    }, event_type="brigades")

    return db_brigade


@router.delete("/{brigade_id}")
async def delete_brigade(
    brigade_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Удалить бригаду (и все связанные исполнители/техника/работы открепятся, brigade_id -> NULL)"""
    db_brigade = db.query(models.Brigade).filter(models.Brigade.id == brigade_id).first()
    if not db_brigade:
        raise HTTPException(status_code=404, detail="Бригада не найдена")

    brigade_date = db_brigade.date.isoformat()

    # Открепляем связанные записи (ставим brigade_id = NULL)
    db.query(models.DailyWork).filter(
        models.DailyWork.brigade_id == brigade_id
    ).update({"brigade_id": None})
    db.query(models.DailyExecutor).filter(
        models.DailyExecutor.brigade_id == brigade_id
    ).update({"brigade_id": None})
    db.query(models.DailyEquipmentUsage).filter(
        models.DailyEquipmentUsage.brigade_id == brigade_id
    ).update({"brigade_id": None})

    db.delete(db_brigade)
    db.commit()

    await manager.broadcast({
        "type": "brigade_deleted",
        "event": "brigades",
        "data": {"id": brigade_id, "date": brigade_date}
    }, event_type="brigades")

    return {"message": "Бригада удалена", "id": brigade_id}


@router.get("/stats", response_model=List[schemas.BrigadeStats])
def get_brigades_stats(
    work_date: date,
    db: Session = Depends(get_db)
):
    """
    Получить полную статистику по всем бригадам за день.
    Возвращает список бригад, каждая со своими исполнителями, техникой и работами.
    """
    brigades = db.query(models.Brigade).filter(
        models.Brigade.date == work_date
    ).order_by(models.Brigade.order).all()

    result = []
    for brigade in brigades:
        result.append(_build_brigade_stats(brigade, work_date, db))

    return result


def _build_brigade_stats(brigade: models.Brigade, work_date: date, db: Session) -> dict:
    """Вспомогательная функция: считает статистику одной бригады"""
    # Исполнители
    executors = db.query(models.DailyExecutor).filter(
        models.DailyExecutor.brigade_id == brigade.id
    ).all()

    executors_with_employees = []
    responsible = None
    total_hours = 0.0

    for ex in executors:
        emp = db.query(models.Employee).filter(models.Employee.id == ex.employee_id).first()
        if emp:
            entry = {
                "id": ex.id,
                "date": ex.date,
                "employee_id": ex.employee_id,
                "hours_worked": ex.hours_worked,
                "is_responsible": ex.is_responsible,
                "brigade_id": ex.brigade_id,
                "created_at": ex.created_at,
                "employee": emp
            }
            executors_with_employees.append(entry)
            if ex.is_responsible:
                responsible = emp
            else:
                total_hours += ex.hours_worked

    executors_count = len([e for e in executors if not e.is_responsible])

    # Трудозатраты по работам бригады
    works = db.query(models.DailyWork).filter(
        models.DailyWork.brigade_id == brigade.id
    ).all()

    total_labor_hours = 0.0
    works_details = []
    for w in works:
        task = db.query(models.Task).filter(models.Task.id == w.task_id).first()
        if task:
            if task.labor_per_unit:
                total_labor_hours += w.volume * task.labor_per_unit
            works_details.append({
                "id": w.id,
                "task_id": w.task_id,
                "date": w.date.isoformat() if w.date else None,
                "volume": w.volume,
                "description": w.description,
                "brigade_id": w.brigade_id,
                "code": task.code,
                "name": task.name,
                "unit": task.unit,
                "unit_price": task.unit_price,
                "labor_per_unit": task.labor_per_unit,
                "machine_hours_per_unit": task.machine_hours_per_unit,
                "executor": task.executor,
            })

    # Техника
    equipment_usages = db.query(models.DailyEquipmentUsage).filter(
        models.DailyEquipmentUsage.brigade_id == brigade.id
    ).all()

    equipment_with_details = []
    total_machine_hours = 0.0
    for eu in equipment_usages:
        eq = db.query(models.Equipment).filter(models.Equipment.id == eu.equipment_id).first()
        if eq:
            equipment_with_details.append({
                "id": eu.id,
                "date": eu.date,
                "equipment_id": eu.equipment_id,
                "machine_hours": eu.machine_hours,
                "brigade_id": eu.brigade_id,
                "created_at": eu.created_at,
                "equipment": eq
            })
            total_machine_hours += eu.machine_hours

    return {
        "brigade": brigade,
        "executors_count": executors_count,
        "total_hours_worked": total_hours,
        "total_labor_hours": total_labor_hours,
        "responsible": responsible,
        "executors": executors_with_employees,
        "equipment_count": len(equipment_usages),
        "total_machine_hours": total_machine_hours,
        "equipment_usage": equipment_with_details,
        "works": works_details,
    }
