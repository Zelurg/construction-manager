from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas
from ..database import get_db
from ..websocket_manager import manager
from ..dependencies import get_current_user

router = APIRouter()

@router.get("/tasks", response_model=List[schemas.Task])
def get_tasks(db: Session = Depends(get_db)):
    tasks = db.query(models.Task).all()
    return tasks

@router.post("/tasks", response_model=schemas.Task)
async def create_task(task: schemas.TaskCreate, db: Session = Depends(get_db)):
    db_task = models.Task(**task.dict())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    
    # Отправляем уведомление всем подключенным клиентам
    await manager.broadcast({
        "type": "task_created",
        "event": "tasks",
        "data": {
            "id": db_task.id,
            "code": db_task.code,
            "name": db_task.name,
            "unit": db_task.unit,
            "volume_plan": db_task.volume_plan,
            "volume_fact": db_task.volume_fact,
            "start_date_contract": db_task.start_date_contract.isoformat() if db_task.start_date_contract else None,
            "end_date_contract": db_task.end_date_contract.isoformat() if db_task.end_date_contract else None,
            "start_date_plan": db_task.start_date_plan.isoformat() if db_task.start_date_plan else None,
            "end_date_plan": db_task.end_date_plan.isoformat() if db_task.end_date_plan else None
        }
    }, event_type="tasks")
    
    return db_task

# Тестовый endpoint - проверь, что роутер работает
@router.get("/test")
def test_endpoint():
    return {"message": "Schedule router is working!"}

@router.post("/clear")
async def clear_all_tasks(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Удаляет ВСЕ задачи из графика вместе со связанными данными.
    Доступно только администраторам.
    """
    print(f"Clear called by user: {current_user.username}, role: {current_user.role}")  # DEBUG
    
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Только администратор может очистить график"
        )
    
    try:
        # ВАЖНО: Удаляем в правильном порядке (сначала зависимые таблицы)
        
        # 1. Удаляем daily_works
        daily_deleted = db.query(models.DailyWork).delete()
        print(f"Deleted {daily_deleted} daily works")  # DEBUG
        
        # 2. Удаляем monthly_tasks
        monthly_deleted = db.query(models.MonthlyTask).delete()
        print(f"Deleted {monthly_deleted} monthly tasks")  # DEBUG
        
        # 3. Теперь можно удалить tasks
        tasks_deleted = db.query(models.Task).delete()
        print(f"Deleted {tasks_deleted} tasks")  # DEBUG
        
        db.commit()
        
        total_deleted = daily_deleted + monthly_deleted + tasks_deleted
        
        await manager.broadcast({
            "type": "schedule_cleared",
            "event": "tasks",
            "data": {
                "message": "График очищен",
                "tasks_deleted": tasks_deleted,
                "daily_deleted": daily_deleted,
                "monthly_deleted": monthly_deleted,
                "total_deleted": total_deleted
            }
        }, event_type="tasks")
        
        return {
            "message": "Все данные успешно удалены",
            "tasks_deleted": tasks_deleted,
            "daily_works_deleted": daily_deleted,
            "monthly_tasks_deleted": monthly_deleted,
            "total_deleted": total_deleted
        }
    except Exception as e:
        print(f"Error clearing tasks: {e}")  # DEBUG
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка при очистке графика: {str(e)}")

@router.put("/tasks/{task_id}", response_model=schemas.Task)
async def update_task(
    task_id: int, 
    task: schemas.TaskUpdate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Обновление задачи.
    Редактирование плановых дат доступно только администраторам.
    """
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Проверка прав: только админ может редактировать плановые даты
    update_data = task.dict(exclude_unset=True)
    
    # Если пытаются обновить плановые даты - проверяем роль
    if ('start_date_plan' in update_data or 'end_date_plan' in update_data):
        if current_user.role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Только администратор может редактировать плановые даты"
            )
    
    # Обновляем только переданные поля
    for key, value in update_data.items():
        setattr(db_task, key, value)
    
    db.commit()
    db.refresh(db_task)
    
    # Отправляем уведомление об обновлении
    await manager.broadcast({
        "type": "task_updated",
        "event": "tasks",
        "data": {
            "id": db_task.id,
            "code": db_task.code,
            "name": db_task.name,
            "unit": db_task.unit,
            "volume_plan": db_task.volume_plan,
            "volume_fact": db_task.volume_fact,
            "start_date_contract": db_task.start_date_contract.isoformat() if db_task.start_date_contract else None,
            "end_date_contract": db_task.end_date_contract.isoformat() if db_task.end_date_contract else None,
            "start_date_plan": db_task.start_date_plan.isoformat() if db_task.start_date_plan else None,
            "end_date_plan": db_task.end_date_plan.isoformat() if db_task.end_date_plan else None
        }
    }, event_type="tasks")
    
    return db_task

@router.delete("/tasks/{task_id}")
async def delete_task(task_id: int, db: Session = Depends(get_db)):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    db.delete(db_task)
    db.commit()
    
    # Отправляем уведомление об удалении
    await manager.broadcast({
        "type": "task_deleted",
        "event": "tasks",
        "data": {
            "id": task_id
        }
    }, event_type="tasks")
    
    return {"message": "Task deleted successfully"}
