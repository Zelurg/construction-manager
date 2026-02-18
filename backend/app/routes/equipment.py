from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user

router = APIRouter()

@router.get("/", response_model=List[schemas.Equipment])
def get_equipment(
    skip: int = 0, 
    limit: int = 100,
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    """
    Получить список всей техники
    
    - skip: сколько записей пропустить (для пагинации)
    - limit: максимальное количество записей
    - active_only: показывать только активную технику
    """
    query = db.query(models.Equipment)
    
    if active_only:
        query = query.filter(models.Equipment.is_active == True)
    
    equipment_list = query.order_by(models.Equipment.equipment_type, models.Equipment.model).offset(skip).limit(limit).all()
    return equipment_list

@router.get("/{equipment_id}", response_model=schemas.Equipment)
def get_equipment_by_id(
    equipment_id: int,
    db: Session = Depends(get_db)
):
    """
    Получить технику по ID
    """
    equipment = db.query(models.Equipment).filter(models.Equipment.id == equipment_id).first()
    if not equipment:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    return equipment

@router.post("/", response_model=schemas.Equipment)
def create_equipment(
    equipment: schemas.EquipmentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Создать новую технику
    
    Требуется авторизация
    """
    # Проверяем, нет ли уже техники с таким же гос. номером
    existing = db.query(models.Equipment).filter(
        models.Equipment.registration_number == equipment.registration_number
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"Техника с гос. номером '{equipment.registration_number}' уже существует"
        )
    
    db_equipment = models.Equipment(**equipment.dict())
    db.add(db_equipment)
    db.commit()
    db.refresh(db_equipment)
    
    return db_equipment

@router.put("/{equipment_id}", response_model=schemas.Equipment)
def update_equipment(
    equipment_id: int,
    equipment: schemas.EquipmentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Обновить данные техники
    
    Требуется авторизация
    """
    db_equipment = db.query(models.Equipment).filter(models.Equipment.id == equipment_id).first()
    if not db_equipment:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    
    # Обновляем только переданные поля
    update_data = equipment.dict(exclude_unset=True)
    
    # Если обновляется гос. номер, проверяем на дубликаты
    if 'registration_number' in update_data:
        existing = db.query(models.Equipment).filter(
            models.Equipment.registration_number == update_data['registration_number'],
            models.Equipment.id != equipment_id
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Техника с гос. номером '{update_data['registration_number']}' уже существует"
            )
    
    for key, value in update_data.items():
        setattr(db_equipment, key, value)
    
    db.commit()
    db.refresh(db_equipment)
    
    return db_equipment

@router.delete("/{equipment_id}")
def delete_equipment(
    equipment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Удалить технику
    
    ВНИМАНИЕ: Это удалит все связанные записи об использовании!
    Требуется авторизация
    """
    db_equipment = db.query(models.Equipment).filter(models.Equipment.id == equipment_id).first()
    if not db_equipment:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    
    # Проверяем, есть ли связанные записи об использовании
    usage_count = db.query(models.DailyEquipmentUsage).filter(
        models.DailyEquipmentUsage.equipment_id == equipment_id
    ).count()
    
    if usage_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Невозможно удалить технику. Есть {usage_count} связанных записей об использовании. Сначала удалите эти записи или сделайте технику неактивной."
        )
    
    db.delete(db_equipment)
    db.commit()
    
    return {"message": "Техника успешно удалена", "id": equipment_id}

@router.patch("/{equipment_id}/deactivate")
def deactivate_equipment(
    equipment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Деактивировать технику (не удаляя её из базы)
    
    Это безопасная альтернатива удалению
    """
    db_equipment = db.query(models.Equipment).filter(models.Equipment.id == equipment_id).first()
    if not db_equipment:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    
    db_equipment.is_active = False
    db.commit()
    db.refresh(db_equipment)
    
    return db_equipment

@router.patch("/{equipment_id}/activate")
def activate_equipment(
    equipment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Активировать технику
    """
    db_equipment = db.query(models.Equipment).filter(models.Equipment.id == equipment_id).first()
    if not db_equipment:
        raise HTTPException(status_code=404, detail="Техника не найдена")
    
    db_equipment.is_active = True
    db.commit()
    db.refresh(db_equipment)
    
    return db_equipment
