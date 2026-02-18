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

@router.get("/", response_model=List[schemas.DailyEquipmentUsageWithEquipment])
def get_daily_equipment_usage(
    work_date: date,
    db: Session = Depends(get_db)
):
    """
    Получить список техники, использованной за конкретную дату
    
    - work_date: дата работы
    """
    equipment_usage = db.query(models.DailyEquipmentUsage).filter(
        models.DailyEquipmentUsage.date == work_date
    ).all()
    
    # Загружаем связанные данные о технике
    result = []
    for usage in equipment_usage:
        equipment = db.query(models.Equipment).filter(
            models.Equipment.id == usage.equipment_id
        ).first()
        
        if equipment:
            result.append({
                "id": usage.id,
                "date": usage.date,
                "equipment_id": usage.equipment_id,
                "machine_hours": usage.machine_hours,
                "created_at": usage.created_at,
                "equipment": equipment
            })
    
    return result

@router.get("/stats", response_model=schemas.DailyEquipmentStats)
def get_daily_equipment_stats(
    work_date: date,
    db: Session = Depends(get_db)
):
    """
    Получить статистику по технике за день
    
    Возвращает:
    - total_machine_hours: суммарные отработанные машиночасы
    - total_work_machine_hours: суммарные машиночасы по внесенным объемам
    - equipment_count: количество единиц техники
    - equipment_usage: список всей техники
    """
    # Получаем всю технику за день
    equipment_usage_list = db.query(models.DailyEquipmentUsage).filter(
        models.DailyEquipmentUsage.date == work_date
    ).all()
    
    # Считаем суммарные отработанные машиночасы
    total_machine_hours = sum(e.machine_hours for e in equipment_usage_list)
    
    # Считаем машиночасы по внесенным объемам
    daily_works = db.query(models.DailyWork).filter(
        models.DailyWork.date == work_date
    ).all()
    
    total_work_machine_hours = 0
    for work in daily_works:
        task = db.query(models.Task).filter(models.Task.id == work.task_id).first()
        if task and task.machine_hours_per_unit:
            total_work_machine_hours += work.volume * task.machine_hours_per_unit
    
    # Формируем список техники с полной информацией
    equipment_usage_with_details = []
    for usage in equipment_usage_list:
        equipment = db.query(models.Equipment).filter(
            models.Equipment.id == usage.equipment_id
        ).first()
        
        if equipment:
            equipment_usage_with_details.append({
                "id": usage.id,
                "date": usage.date,
                "equipment_id": usage.equipment_id,
                "machine_hours": usage.machine_hours,
                "created_at": usage.created_at,
                "equipment": equipment
            })
    
    # Количество единиц техники
    equipment_count = len(equipment_usage_list)
    
    return {
        "date": work_date,
        "total_machine_hours": total_machine_hours,
        "total_work_machine_hours": total_work_machine_hours,
        "equipment_count": equipment_count,
        "equipment_usage": equipment_usage_with_details
    }

@router.post("/", response_model=schemas.DailyEquipmentUsage)
async def create_daily_equipment_usage(
    usage: schemas.DailyEquipmentUsageCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Добавить технику на день
    
    ВАЖНО:
    - Одна единица техники может быть добавлена только один раз на дату
    """
    # Проверяем существование техники
    equipment = db.query(models.Equipment).filter(
        models.Equipment.id == usage.equipment_id
    ).first()
    
    if not equipment:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    
    if not equipment.is_active:
        raise HTTPException(
            status_code=400,
            detail=f"Техника '{equipment.equipment_type} {equipment.model}' неактивна"
        )
    
    # Проверяем, нет ли уже этой техники в этот день
    existing = db.query(models.DailyEquipmentUsage).filter(
        models.DailyEquipmentUsage.date == usage.date,
        models.DailyEquipmentUsage.equipment_id == usage.equipment_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Техника '{equipment.equipment_type} {equipment.model} ({equipment.registration_number})' уже добавлена на эту дату"
        )
    
    # Создаем запись
    db_usage = models.DailyEquipmentUsage(**usage.dict())
    db.add(db_usage)
    db.commit()
    db.refresh(db_usage)
    
    # Отправляем уведомление через WebSocket
    await manager.broadcast({
        "type": "equipment_usage_added",
        "event": "equipment_usage",
        "data": {
            "id": db_usage.id,
            "date": db_usage.date.isoformat(),
            "equipment_id": db_usage.equipment_id,
            "machine_hours": db_usage.machine_hours
        }
    }, event_type="equipment_usage")
    
    return db_usage

@router.put("/{usage_id}", response_model=schemas.DailyEquipmentUsage)
async def update_daily_equipment_usage(
    usage_id: int,
    usage: schemas.DailyEquipmentUsageUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Обновить данные об использовании техники (например, машиночасы)
    """
    db_usage = db.query(models.DailyEquipmentUsage).filter(
        models.DailyEquipmentUsage.id == usage_id
    ).first()
    
    if not db_usage:
        raise HTTPException(status_code=404, detail="Запись об использовании техники не найдена")
    
    # Обновляем только переданные поля
    update_data = usage.dict(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(db_usage, key, value)
    
    db.commit()
    db.refresh(db_usage)
    
    # Отправляем уведомление
    await manager.broadcast({
        "type": "equipment_usage_updated",
        "event": "equipment_usage",
        "data": {
            "id": db_usage.id,
            "date": db_usage.date.isoformat(),
            "equipment_id": db_usage.equipment_id,
            "machine_hours": db_usage.machine_hours
        }
    }, event_type="equipment_usage")
    
    return db_usage

@router.delete("/{usage_id}")
async def delete_daily_equipment_usage(
    usage_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Удалить технику из дня
    """
    db_usage = db.query(models.DailyEquipmentUsage).filter(
        models.DailyEquipmentUsage.id == usage_id
    ).first()
    
    if not db_usage:
        raise HTTPException(status_code=404, detail="Запись об использовании техники не найдена")
    
    usage_data = {
        "id": db_usage.id,
        "date": db_usage.date.isoformat(),
        "equipment_id": db_usage.equipment_id
    }
    
    db.delete(db_usage)
    db.commit()
    
    # Отправляем уведомление
    await manager.broadcast({
        "type": "equipment_usage_deleted",
        "event": "equipment_usage",
        "data": usage_data
    }, event_type="equipment_usage")
    
    return {"message": "Техника успешно удалена из дня", "id": usage_id}
