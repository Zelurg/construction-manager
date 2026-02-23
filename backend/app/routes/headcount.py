from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, extract
from datetime import date
from typing import Optional
from ..database import get_db
from ..models import DailyHeadcount, Task
from ..schemas import DailyHeadcountUpsert, DailyHeadcountRead
from ..routes.auth import get_current_user
from ..schemas import UserResponse

router = APIRouter()


@router.get("/", response_model=list[DailyHeadcountRead])
def get_headcounts(
    project_id: Optional[int] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Получить все назначения людей. Фильтрация по проекту и/или месяцу."""
    q = db.query(DailyHeadcount)
    if project_id:
        q = q.filter(DailyHeadcount.project_id == project_id)
    if year:
        q = q.filter(extract('year', DailyHeadcount.date) == year)
    if month:
        q = q.filter(extract('month', DailyHeadcount.date) == month)
    return q.all()


@router.post("/upsert", response_model=DailyHeadcountRead)
def upsert_headcount(
    payload: DailyHeadcountUpsert,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Создать или обновить назначение (upsert по task_id + date)."""
    # Получаем project_id из задачи
    task = db.query(Task).filter(Task.id == payload.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    existing = db.query(DailyHeadcount).filter(
        and_(
            DailyHeadcount.task_id == payload.task_id,
            DailyHeadcount.date == payload.date,
        )
    ).first()

    if existing:
        existing.headcount = payload.headcount
        db.commit()
        db.refresh(existing)
        return existing
    else:
        new_hc = DailyHeadcount(
            task_id=payload.task_id,
            date=payload.date,
            headcount=payload.headcount,
            project_id=task.project_id,
        )
        db.add(new_hc)
        db.commit()
        db.refresh(new_hc)
        return new_hc


@router.delete("/by-month")
def delete_headcounts_by_month(
    project_id: Optional[int] = None,
    year: int = None,
    month: int = None,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Удалить все назначения за указанный месяц (и проект)."""
    if not year or not month:
        raise HTTPException(status_code=400, detail="year и month обязательны")
    q = db.query(DailyHeadcount).filter(
        and_(
            extract('year', DailyHeadcount.date) == year,
            extract('month', DailyHeadcount.date) == month,
        )
    )
    if project_id:
        q = q.filter(DailyHeadcount.project_id == project_id)
    deleted = q.delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}
