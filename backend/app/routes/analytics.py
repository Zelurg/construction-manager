from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date
from .. import models, schemas
from ..database import get_db

router = APIRouter()

@router.get("/", response_model=schemas.Analytics)
def get_analytics(db: Session = Depends(get_db)):
    # Total progress
    total_plan = db.query(func.sum(models.Task.volume_plan)).scalar() or 0
    total_fact = db.query(func.sum(models.Task.volume_fact)).scalar() or 0
    total_progress = (total_fact / total_plan * 100) if total_plan > 0 else 0
    
    # Time progress
    tasks = db.query(models.Task).all()
    if tasks:
        earliest_start = min(task.start_date for task in tasks)
        latest_end = max(task.end_date for task in tasks)
        total_days = (latest_end - earliest_start).days
        days_passed = (date.today() - earliest_start).days
        time_progress = (days_passed / total_days * 100) if total_days > 0 else 0
    else:
        time_progress = 0
    
    # Labor (using volume as proxy)
    labor_plan = total_plan
    labor_fact = total_fact
    labor_remaining = labor_plan - labor_fact
    
    return {
        "total_progress_percent": round(total_progress, 2),
        "time_progress_percent": round(time_progress, 2),
        "labor_plan": labor_plan,
        "labor_fact": labor_fact,
        "labor_remaining": labor_remaining
    }
