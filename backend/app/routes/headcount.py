from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, extract, text
from datetime import date
from typing import Optional, List
import logging
from ..database import get_db, engine, Base
from ..models import DailyHeadcount, Task
from ..schemas import DailyHeadcountUpsert, DailyHeadcountRead
from ..routes.auth import get_current_user
from ..schemas import UserResponse

router = APIRouter()
logger = logging.getLogger(__name__)


def ensure_table():
    """Создаём таблицу если не существует (на случай первого запуска)."""
    try:
        Base.metadata.create_all(bind=engine, tables=[DailyHeadcount.__table__], checkfirst=True)
    except Exception as e:
        logger.error(f"Ошибка создания таблицы daily_headcount: {e}")


@router.get("/", response_model=List[DailyHeadcountRead])
def get_headcounts(
    project_id: Optional[int] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Получить все назначения людей. Фильтрация по проекту и/или месяцу."""
    ensure_table()
    try:
        q = db.query(DailyHeadcount)
        if project_id is not None:
            q = q.filter(DailyHeadcount.project_id == project_id)
        if year is not None:
            q = q.filter(extract('year', DailyHeadcount.date) == int(year))
        if month is not None:
            q = q.filter(extract('month', DailyHeadcount.date) == int(month))
        return q.all()
    except Exception as e:
        logger.error(f"Ошибка получения headcount: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка БД: {str(e)}")


@router.post("/upsert", response_model=DailyHeadcountRead)
def upsert_headcount(
    payload: DailyHeadcountUpsert,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Создать или обновить назначение (upsert по task_id + date)."""
    ensure_table()
    try:
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
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Ошибка upsert headcount: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка БД: {str(e)}")


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
    ensure_table()
    try:
        q = db.query(DailyHeadcount).filter(
            and_(
                extract('year', DailyHeadcount.date) == int(year),
                extract('month', DailyHeadcount.date) == int(month),
            )
        )
        if project_id is not None:
            q = q.filter(DailyHeadcount.project_id == project_id)
        deleted = q.delete(synchronize_session=False)
        db.commit()
        return {"deleted": deleted}
    except Exception as e:
        db.rollback()
        logger.error(f"Ошибка удаления headcount: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка БД: {str(e)}")
