from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, extract, func
from typing import List
from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from .. import models, schemas
from ..database import get_db

router = APIRouter()

@router.get("/tasks", response_model=List[schemas.MonthlyTask])
def get_monthly_tasks(month: date, db: Session = Depends(get_db)):
    tasks = db.query(models.MonthlyTask).filter(models.MonthlyTask.month == month).all()
    return tasks

@router.post("/tasks", response_model=schemas.MonthlyTask)
def create_monthly_task(task: schemas.MonthlyTaskCreate, db: Session = Depends(get_db)):
    db_task = models.MonthlyTask(**task.dict())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

@router.get("/tasks/with-details")
def get_monthly_tasks_with_details(month: str, db: Session = Depends(get_db)):
    """
    Получить все задачи, которые выполняются в выбранном месяце.
    
    Логика:
    - month приходит в формате "2026-02-01" (первый день месяца)
    - Находим все задачи, у которых период выполнения (start_date - end_date) 
      пересекается с выбранным месяцем
    """
    try:
        # Парсим входящую дату (формат: "2026-02-01")
        month_date = datetime.strptime(month, "%Y-%m-%d").date()
        
        # Вычисляем первый и последний день месяца
        first_day = month_date.replace(day=1)
        # Получаем первый день следующего месяца и вычитаем 1 день
        if month_date.month == 12:
            last_day = month_date.replace(year=month_date.year + 1, month=1, day=1)
        else:
            last_day = month_date.replace(month=month_date.month + 1, day=1)
        
        # Для последнего дня месяца используем конец дня
        # но в SQL сравнении с Date достаточно просто < first_day_next_month
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат даты. Ожидается YYYY-MM-DD")
    
    # Получаем все задачи, которые пересекаются с выбранным месяцем
    # Задача пересекается с месяцем если:
    # start_date <= last_day_of_month AND end_date >= first_day_of_month
    tasks = db.query(models.Task).filter(
        and_(
            models.Task.start_date < last_day,  # Начало задачи до конца месяца
            models.Task.end_date >= first_day    # Конец задачи после начала месяца
        )
    ).all()
    
    result = []
    for task in tasks:
        # Пытаемся найти запись в MonthlyTask для этого месяца
        monthly_task = db.query(models.MonthlyTask).filter(
            and_(
                models.MonthlyTask.task_id == task.id,
                models.MonthlyTask.month == first_day
            )
        ).first()
        
        # Если есть запись в MonthlyTask, берём оттуда плановый объём
        # Иначе используем общий плановый объём задачи
        volume_plan = monthly_task.volume_plan if monthly_task else task.volume_plan
        
        result.append({
            "id": monthly_task.id if monthly_task else task.id,
            "task_id": task.id,
            "code": task.code,
            "name": task.name,
            "unit": task.unit,
            "volume_plan": volume_plan,
            "volume_fact": task.volume_fact,
            "start_date": task.start_date.isoformat(),
            "end_date": task.end_date.isoformat()
        })
    
    return result
