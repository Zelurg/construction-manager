from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import date
from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user
from ..websocket_manager import manager

router = APIRouter()

@router.get("/", response_model=List[schemas.DailyExecutorWithEmployee])
def get_daily_executors(
    work_date: date,
    brigade_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(models.DailyExecutor).filter(
        models.DailyExecutor.date == work_date
    )
    if brigade_id is not None:
        query = query.filter(models.DailyExecutor.brigade_id == brigade_id)

    executors = query.all()
    result = []
    for executor in executors:
        employee = db.query(models.Employee).filter(
            models.Employee.id == executor.employee_id
        ).first()
        if employee:
            result.append({
                "id": executor.id,
                "date": executor.date,
                "employee_id": executor.employee_id,
                "hours_worked": executor.hours_worked,
                "is_responsible": executor.is_responsible,
                "brigade_id": executor.brigade_id,
                "created_at": executor.created_at,
                "employee": employee
            })
    return result


@router.get("/stats", response_model=schemas.DailyExecutorStats)
def get_daily_executor_stats(
    work_date: date,
    brigade_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Статистика по исполнителям за день.
    Если передан brigade_id — возвращает только исполнителей этой бригады.
    """
    query = db.query(models.DailyExecutor).filter(
        models.DailyExecutor.date == work_date
    )
    if brigade_id is not None:
        query = query.filter(models.DailyExecutor.brigade_id == brigade_id)

    executors = query.all()

    total_hours_worked = sum(e.hours_worked for e in executors if not e.is_responsible)

    responsible_executor = next((e for e in executors if e.is_responsible), None)
    responsible = None
    if responsible_executor:
        responsible = db.query(models.Employee).filter(
            models.Employee.id == responsible_executor.employee_id
        ).first()

    # Трудозатраты по работам бригады
    works_query = db.query(models.DailyWork).filter(
        models.DailyWork.date == work_date
    )
    if brigade_id is not None:
        works_query = works_query.filter(models.DailyWork.brigade_id == brigade_id)
    daily_works = works_query.all()

    total_labor_hours = 0
    for work in daily_works:
        task = db.query(models.Task).filter(models.Task.id == work.task_id).first()
        if task and task.labor_per_unit:
            total_labor_hours += work.volume * task.labor_per_unit

    executors_with_employees = []
    for executor in executors:
        employee = db.query(models.Employee).filter(
            models.Employee.id == executor.employee_id
        ).first()
        if employee:
            executors_with_employees.append({
                "id": executor.id,
                "date": executor.date,
                "employee_id": executor.employee_id,
                "hours_worked": executor.hours_worked,
                "is_responsible": executor.is_responsible,
                "brigade_id": executor.brigade_id,
                "created_at": executor.created_at,
                "employee": employee
            })

    executors_count = len([e for e in executors if not e.is_responsible])

    return {
        "date": work_date,
        "total_hours_worked": total_hours_worked,
        "total_labor_hours": total_labor_hours,
        "executors_count": executors_count,
        "responsible": responsible,
        "executors": executors_with_employees
    }


@router.post("/", response_model=schemas.DailyExecutor)
async def create_daily_executor(
    executor: schemas.DailyExecutorCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    employee = db.query(models.Employee).filter(
        models.Employee.id == executor.employee_id
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    # Проверяем дубликат в рамках бригады
    existing = db.query(models.DailyExecutor).filter(
        models.DailyExecutor.date == executor.date,
        models.DailyExecutor.employee_id == executor.employee_id,
        models.DailyExecutor.brigade_id == executor.brigade_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Сотрудник '{employee.full_name}' уже добавлен в эту бригаду на эту дату"
        )

    if executor.is_responsible:
        # Один ответственный на бригаду
        existing_responsible = db.query(models.DailyExecutor).filter(
            models.DailyExecutor.date == executor.date,
            models.DailyExecutor.brigade_id == executor.brigade_id,
            models.DailyExecutor.is_responsible == True
        ).first()
        if existing_responsible:
            resp_employee = db.query(models.Employee).filter(
                models.Employee.id == existing_responsible.employee_id
            ).first()
            raise HTTPException(
                status_code=400,
                detail=f"В этой бригаде уже есть ответственный: {resp_employee.full_name if resp_employee else 'Неизвестен'}"
            )
    else:
        is_responsible = db.query(models.DailyExecutor).filter(
            models.DailyExecutor.date == executor.date,
            models.DailyExecutor.brigade_id == executor.brigade_id,
            models.DailyExecutor.employee_id == executor.employee_id,
            models.DailyExecutor.is_responsible == True
        ).first()
        if is_responsible:
            raise HTTPException(
                status_code=400,
                detail="Этот сотрудник уже назначен ответственным в этой бригаде"
            )

    db_executor = models.DailyExecutor(**executor.dict())
    db.add(db_executor)
    db.commit()
    db.refresh(db_executor)

    await manager.broadcast({
        "type": "executor_added",
        "event": "executors",
        "data": {
            "id": db_executor.id,
            "date": db_executor.date.isoformat(),
            "employee_id": db_executor.employee_id,
            "hours_worked": db_executor.hours_worked,
            "is_responsible": db_executor.is_responsible,
            "brigade_id": db_executor.brigade_id
        }
    }, event_type="executors")

    return db_executor


@router.put("/{executor_id}", response_model=schemas.DailyExecutor)
async def update_daily_executor(
    executor_id: int,
    executor: schemas.DailyExecutorUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_executor = db.query(models.DailyExecutor).filter(
        models.DailyExecutor.id == executor_id
    ).first()
    if not db_executor:
        raise HTTPException(status_code=404, detail="Исполнитель не найден")

    update_data = executor.dict(exclude_unset=True)

    if 'is_responsible' in update_data and update_data['is_responsible']:
        existing_responsible = db.query(models.DailyExecutor).filter(
            models.DailyExecutor.date == db_executor.date,
            models.DailyExecutor.brigade_id == db_executor.brigade_id,
            models.DailyExecutor.is_responsible == True,
            models.DailyExecutor.id != executor_id
        ).first()
        if existing_responsible:
            raise HTTPException(
                status_code=400,
                detail="В этой бригаде уже есть ответственный"
            )

    for key, value in update_data.items():
        setattr(db_executor, key, value)

    db.commit()
    db.refresh(db_executor)

    await manager.broadcast({
        "type": "executor_updated",
        "event": "executors",
        "data": {
            "id": db_executor.id,
            "date": db_executor.date.isoformat(),
            "employee_id": db_executor.employee_id,
            "hours_worked": db_executor.hours_worked,
            "is_responsible": db_executor.is_responsible,
            "brigade_id": db_executor.brigade_id
        }
    }, event_type="executors")

    return db_executor


@router.delete("/{executor_id}")
async def delete_daily_executor(
    executor_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_executor = db.query(models.DailyExecutor).filter(
        models.DailyExecutor.id == executor_id
    ).first()
    if not db_executor:
        raise HTTPException(status_code=404, detail="Исполнитель не найден")

    executor_data = {
        "id": db_executor.id,
        "date": db_executor.date.isoformat(),
        "employee_id": db_executor.employee_id,
        "brigade_id": db_executor.brigade_id
    }

    db.delete(db_executor)
    db.commit()

    await manager.broadcast({
        "type": "executor_deleted",
        "event": "executors",
        "data": executor_data
    }, event_type="executors")

    return {"message": "Исполнитель удалён", "id": executor_id}
