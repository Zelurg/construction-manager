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
            "start_date": db_task.start_date.isoformat() if db_task.start_date else None,
            "end_date": db_task.end_date.isoformat() if db_task.end_date else None
        }
    }, event_type="tasks")
    
    return db_task

@router.post("/clear")
async def clear_all_tasks(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Удаляет ВСЕ задачи из графика.
    Доступно только администраторам.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Только администратор может очистить график"
        )
    
    try:
        deleted_count = db.query(models.Task).delete()
        db.commit()
        
        await manager.broadcast({
            "type": "schedule_cleared",
            "event": "tasks",
            "data": {
                "message": "График очищен",
                "deleted_count": deleted_count
            }
        }, event_type="tasks")
        
        return {
            "message": "Все задачи успешно удалены",
            "deleted_count": deleted_count
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка при очистке графика: {str(e)}")

@router.put("/tasks/{task_id}", response_model=schemas.Task)
async def update_task(task_id: int, task: schemas.TaskCreate, db: Session = Depends(get_db)):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    for key, value in task.dict().items():
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
            "start_date": db_task.start_date.isoformat() if db_task.start_date else None,
            "end_date": db_task.end_date.isoformat() if db_task.end_date else None
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
