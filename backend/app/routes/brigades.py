from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import date
from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user
from ..websocket_manager import manager
from .projects import touch_project

router = APIRouter()


@router.get("/", response_model=List[schemas.Brigade])
def get_brigades(
    work_date: date,
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(models.Brigade).filter(models.Brigade.date == work_date)
    if project_id is not None:
        query = query.filter(models.Brigade.project_id == project_id)
    return query.order_by(models.Brigade.order).all()


@router.post("/", response_model=schemas.Brigade)
async def create_brigade(
    brigade: schemas.BrigadeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    max_order = db.query(func.max(models.Brigade.order)).filter(
        models.Brigade.date == brigade.date,
        models.Brigade.project_id == brigade.project_id
    ).scalar() or 0
    db_brigade = models.Brigade(
        date=brigade.date,
        name=brigade.name,
        order=max_order + 1,
        project_id=brigade.project_id
    )
    db.add(db_brigade)
    db.commit()
    db.refresh(db_brigade)
    touch_project(brigade.project_id, db)
    await manager.broadcast(
        {"type": "brigade_created", "event": "brigades",
         "data": {"id": db_brigade.id, "project_id": db_brigade.project_id}},
        event_type="brigades"
    )
    return db_brigade


@router.put("/{brigade_id}", response_model=schemas.Brigade)
async def update_brigade(
    brigade_id: int,
    brigade: schemas.BrigadeUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_brigade = db.query(models.Brigade).filter(models.Brigade.id == brigade_id).first()
    if not db_brigade:
        raise HTTPException(status_code=404, detail="Бригада не найдена")
    if brigade.name is not None:
        db_brigade.name = brigade.name
    db.commit()
    db.refresh(db_brigade)
    touch_project(db_brigade.project_id, db)
    await manager.broadcast(
        {"type": "brigade_updated", "event": "brigades", "data": {"id": db_brigade.id}},
        event_type="brigades"
    )
    return db_brigade


@router.delete("/{brigade_id}")
async def delete_brigade(
    brigade_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_brigade = db.query(models.Brigade).filter(models.Brigade.id == brigade_id).first()
    if not db_brigade:
        raise HTTPException(status_code=404, detail="Бригада не найдена")
    project_id = db_brigade.project_id
    db.query(models.DailyWork).filter(models.DailyWork.brigade_id == brigade_id).update({"brigade_id": None})
    db.query(models.DailyExecutor).filter(models.DailyExecutor.brigade_id == brigade_id).update({"brigade_id": None})
    db.query(models.DailyEquipmentUsage).filter(models.DailyEquipmentUsage.brigade_id == brigade_id).update({"brigade_id": None})
    db.delete(db_brigade)
    db.commit()
    touch_project(project_id, db)
    await manager.broadcast(
        {"type": "brigade_deleted", "event": "brigades", "data": {"id": brigade_id}},
        event_type="brigades"
    )
    return {"message": "Бригада удалена", "id": brigade_id}


@router.get("/stats", response_model=List[schemas.BrigadeStats])
def get_brigades_stats(
    work_date: date,
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(models.Brigade).filter(models.Brigade.date == work_date)
    if project_id is not None:
        query = query.filter(models.Brigade.project_id == project_id)
    brigades = query.order_by(models.Brigade.order).all()
    return [_build_brigade_stats(b, db) for b in brigades]


def _build_brigade_stats(brigade: models.Brigade, db: Session) -> dict:
    executors = db.query(models.DailyExecutor).filter(
        models.DailyExecutor.brigade_id == brigade.id
    ).all()
    executors_with_employees = []
    responsible = None
    total_hours = 0.0
    for ex in executors:
        emp = db.query(models.Employee).filter(models.Employee.id == ex.employee_id).first()
        if emp:
            executors_with_employees.append({
                "id": ex.id, "date": ex.date, "employee_id": ex.employee_id,
                "hours_worked": ex.hours_worked, "is_responsible": ex.is_responsible,
                "brigade_id": ex.brigade_id, "created_at": ex.created_at, "employee": emp
            })
            if ex.is_responsible:
                responsible = emp
            else:
                total_hours += ex.hours_worked

    all_works = db.query(models.DailyWork).filter(
        models.DailyWork.brigade_id == brigade.id
    ).all()

    works_details = []
    total_labor_hours = 0.0
    ancillary_works = []
    total_ancillary_hours = 0.0

    for w in all_works:
        if w.is_ancillary:
            ancillary_works.append({
                "id": w.id, "task_id": None,
                "date": w.date.isoformat() if w.date else None,
                "volume": w.volume, "description": w.description,
                "brigade_id": w.brigade_id, "is_ancillary": True,
            })
            total_ancillary_hours += w.volume
        else:
            task = db.query(models.Task).filter(models.Task.id == w.task_id).first()
            if task:
                if task.labor_per_unit:
                    total_labor_hours += w.volume * task.labor_per_unit
                works_details.append({
                    "id": w.id, "task_id": w.task_id,
                    "date": w.date.isoformat() if w.date else None,
                    "volume": w.volume, "description": w.description,
                    "brigade_id": w.brigade_id, "is_ancillary": False,
                    "code": task.code, "name": task.name, "unit": task.unit,
                    "unit_price": task.unit_price, "labor_per_unit": task.labor_per_unit,
                    "machine_hours_per_unit": task.machine_hours_per_unit,
                    "executor": task.executor,
                })

    equipment_usages = db.query(models.DailyEquipmentUsage).filter(
        models.DailyEquipmentUsage.brigade_id == brigade.id
    ).all()
    equipment_with_details = []
    total_machine_hours = 0.0
    for eu in equipment_usages:
        eq = db.query(models.Equipment).filter(models.Equipment.id == eu.equipment_id).first()
        if eq:
            equipment_with_details.append({
                "id": eu.id, "date": eu.date, "equipment_id": eu.equipment_id,
                "machine_hours": eu.machine_hours, "brigade_id": eu.brigade_id,
                "created_at": eu.created_at, "equipment": eq
            })
            total_machine_hours += eu.machine_hours

    return {
        "brigade": brigade,
        "executors_count": len([e for e in executors if not e.is_responsible]),
        "total_hours_worked": total_hours,
        "total_labor_hours": total_labor_hours,
        "responsible": responsible,
        "executors": executors_with_employees,
        "equipment_count": len(equipment_usages),
        "total_machine_hours": total_machine_hours,
        "equipment_usage": equipment_with_details,
        "works": works_details,
        "ancillary_works": ancillary_works,
        "total_ancillary_hours": total_ancillary_hours,
    }
