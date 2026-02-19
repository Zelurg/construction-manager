from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import date
from typing import Optional
from .. import models, schemas
from ..database import get_db

router = APIRouter()


@router.get("/", response_model=schemas.Analytics)
def get_analytics(
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(models.Task).filter(models.Task.is_section == False)
    if project_id is not None:
        query = query.filter(models.Task.project_id == project_id)
    works = query.all()

    total_plan = sum(w.volume_plan or 0 for w in works)
    total_fact = sum(w.volume_fact or 0 for w in works)
    total_progress = (total_fact / total_plan * 100) if total_plan > 0 else 0

    works_with_dates = [w for w in works if w.start_date_plan and w.end_date_plan]
    if works_with_dates:
        earliest_start = min(w.start_date_plan for w in works_with_dates)
        latest_end = max(w.end_date_plan for w in works_with_dates)
        total_days = (latest_end - earliest_start).days
        days_passed = (date.today() - earliest_start).days
        time_progress = (days_passed / total_days * 100) if total_days > 0 else 0
    else:
        time_progress = 0

    labor_plan = sum((w.labor_per_unit or 0) * (w.volume_plan or 0) for w in works)
    labor_fact = sum((w.labor_per_unit or 0) * (w.volume_fact or 0) for w in works)
    machine_hours_plan = sum((w.machine_hours_per_unit or 0) * (w.volume_plan or 0) for w in works)
    machine_hours_fact = sum((w.machine_hours_per_unit or 0) * (w.volume_fact or 0) for w in works)
    cost_plan = sum((w.unit_price or 0) * (w.volume_plan or 0) for w in works)
    cost_fact = sum((w.unit_price or 0) * (w.volume_fact or 0) for w in works)

    return {
        "total_progress_percent": round(total_progress, 2),
        "time_progress_percent": round(time_progress, 2),
        "labor_plan": round(labor_plan, 2),
        "labor_fact": round(labor_fact, 2),
        "labor_remaining": round(labor_plan - labor_fact, 2),
        "machine_hours_plan": round(machine_hours_plan, 2),
        "machine_hours_fact": round(machine_hours_fact, 2),
        "machine_hours_remaining": round(machine_hours_plan - machine_hours_fact, 2),
        "cost_plan": round(cost_plan, 2),
        "cost_fact": round(cost_fact, 2),
        "cost_remaining": round(cost_plan - cost_fact, 2),
    }
