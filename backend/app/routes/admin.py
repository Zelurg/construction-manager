from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from .. import models
from ..database import get_db
from ..dependencies import get_current_admin_user

router = APIRouter(prefix="/admin", tags=["admin"])

@router.post("/recalculate-volumes")
def recalculate_volumes(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin_user)
):
    """
    Пересчитать volume_fact для всех задач на основе DailyWork.
    Доступно только администраторам.
    """
    
    tasks = db.query(models.Task).all()
    updated_count = 0
    results = []
    
    for task in tasks:
        # Считаем сумму всех DailyWork для этой задачи
        total_volume = db.query(func.sum(models.DailyWork.volume)).filter(
            models.DailyWork.task_id == task.id
        ).scalar() or 0
        
        old_fact = task.volume_fact
        
        if old_fact != total_volume:
            task.volume_fact = total_volume
            updated_count += 1
            results.append({
                "code": task.code,
                "name": task.name,
                "old_fact": old_fact,
                "new_fact": total_volume
            })
    
    db.commit()
    
    return {
        "success": True,
        "message": f"Пересчитано {updated_count} задач из {len(tasks)}",
        "total_tasks": len(tasks),
        "updated_tasks": updated_count,
        "details": results
    }
