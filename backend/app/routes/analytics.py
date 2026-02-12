from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date
from .. import models, schemas
from ..database import get_db

router = APIRouter()

@router.get("/", response_model=schemas.Analytics)
def get_analytics(db: Session = Depends(get_db)):
    # Получаем только работы (не разделы)
    works = db.query(models.Task).filter(models.Task.is_section == False).all()
    
    # ========== ПРОГРЕСС ПО ОБЪЕМАМ ==========
    total_plan = sum(work.volume_plan or 0 for work in works)
    total_fact = sum(work.volume_fact or 0 for work in works)
    total_progress = (total_fact / total_plan * 100) if total_plan > 0 else 0
    
    # ========== ПРОГРЕСС ПО ВРЕМЕНИ ==========
    works_with_dates = [w for w in works if w.start_date and w.end_date]
    
    if works_with_dates:
        earliest_start = min(w.start_date for w in works_with_dates)
        latest_end = max(w.end_date for w in works_with_dates)
        total_days = (latest_end - earliest_start).days
        days_passed = (date.today() - earliest_start).days
        time_progress = (days_passed / total_days * 100) if total_days > 0 else 0
    else:
        time_progress = 0
    
    # ========== ТРУДОЗАТРАТЫ ==========
    # Формула: Трудозатраты = labor_per_unit * volume
    labor_plan = sum((work.labor_per_unit or 0) * (work.volume_plan or 0) for work in works)
    labor_fact = sum((work.labor_per_unit or 0) * (work.volume_fact or 0) for work in works)
    labor_remaining = labor_plan - labor_fact
    
    # ========== МАШИНОЧАСЫ ==========
    # Формула: Машиночасы = machine_hours_per_unit * volume
    machine_hours_plan = sum((work.machine_hours_per_unit or 0) * (work.volume_plan or 0) for work in works)
    machine_hours_fact = sum((work.machine_hours_per_unit or 0) * (work.volume_fact or 0) for work in works)
    machine_hours_remaining = machine_hours_plan - machine_hours_fact
    
    # ========== СТОИМОСТЬ ==========
    # Формула: Стоимость = unit_price * volume
    cost_plan = sum((work.unit_price or 0) * (work.volume_plan or 0) for work in works)
    cost_fact = sum((work.unit_price or 0) * (work.volume_fact or 0) for work in works)
    cost_remaining = cost_plan - cost_fact
    
    return {
        "total_progress_percent": round(total_progress, 2),
        "time_progress_percent": round(time_progress, 2),
        # Трудозатраты
        "labor_plan": round(labor_plan, 2),
        "labor_fact": round(labor_fact, 2),
        "labor_remaining": round(labor_remaining, 2),
        # Машиночасы
        "machine_hours_plan": round(machine_hours_plan, 2),
        "machine_hours_fact": round(machine_hours_fact, 2),
        "machine_hours_remaining": round(machine_hours_remaining, 2),
        # Стоимость
        "cost_plan": round(cost_plan, 2),
        "cost_fact": round(cost_fact, 2),
        "cost_remaining": round(cost_remaining, 2),
    }
