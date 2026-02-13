from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user

router = APIRouter()

@router.get("/", response_model=List[schemas.Employee])
def get_employees(
    skip: int = 0, 
    limit: int = 100,
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Получить список всех сотрудников
    
    - skip: сколько записей пропустить (для пагинации)
    - limit: максимальное количество записей
    - active_only: показывать только активных сотрудников
    """
    query = db.query(models.Employee)
    
    if active_only:
        query = query.filter(models.Employee.is_active == True)
    
    employees = query.order_by(models.Employee.full_name).offset(skip).limit(limit).all()
    return employees

@router.get("/{employee_id}", response_model=schemas.Employee)
def get_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Получить сотрудника по ID
    """
    employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return employee

@router.post("/", response_model=schemas.Employee)
def create_employee(
    employee: schemas.EmployeeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Создать нового сотрудника
    
    Требуется авторизация
    """
    # Проверяем, нет ли уже сотрудника с таким же ФИО
    existing = db.query(models.Employee).filter(
        models.Employee.full_name == employee.full_name
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"Сотрудник с ФИО '{employee.full_name}' уже существует"
        )
    
    db_employee = models.Employee(**employee.dict())
    db.add(db_employee)
    db.commit()
    db.refresh(db_employee)
    
    return db_employee

@router.put("/{employee_id}", response_model=schemas.Employee)
def update_employee(
    employee_id: int,
    employee: schemas.EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Обновить данные сотрудника
    
    Требуется авторизация
    """
    db_employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not db_employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    
    # Обновляем только переданные поля
    update_data = employee.dict(exclude_unset=True)
    
    # Если обновляется ФИО, проверяем на дубликаты
    if 'full_name' in update_data:
        existing = db.query(models.Employee).filter(
            models.Employee.full_name == update_data['full_name'],
            models.Employee.id != employee_id
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Сотрудник с ФИО '{update_data['full_name']}' уже существует"
            )
    
    for key, value in update_data.items():
        setattr(db_employee, key, value)
    
    db.commit()
    db.refresh(db_employee)
    
    return db_employee

@router.delete("/{employee_id}")
def delete_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Удалить сотрудника
    
    ВНИМАНИЕ: Это удалит все связанные записи об исполнителях!
    Требуется авторизация
    """
    db_employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not db_employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    
    # Проверяем, есть ли связанные записи об исполнителях
    executors_count = db.query(models.DailyExecutor).filter(
        models.DailyExecutor.employee_id == employee_id
    ).count()
    
    if executors_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Невозможно удалить сотрудника. Есть {executors_count} связанных записей о выполненных работах. Сначала удалите эти записи или сделайте сотрудника неактивным."
        )
    
    db.delete(db_employee)
    db.commit()
    
    return {"message": "Сотрудник успешно удален", "id": employee_id}

@router.patch("/{employee_id}/deactivate")
def deactivate_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Деактивировать сотрудника (не удаляя его из базы)
    
    Это безопасная альтернатива удалению
    """
    db_employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not db_employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    
    db_employee.is_active = False
    db.commit()
    db.refresh(db_employee)
    
    return db_employee

@router.patch("/{employee_id}/activate")
def activate_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Активировать сотрудника
    """
    db_employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not db_employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    
    db_employee.is_active = True
    db.commit()
    db.refresh(db_employee)
    
    return db_employee
