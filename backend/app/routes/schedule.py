from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user
from ..websocket_manager import manager
from .projects import touch_project

router = APIRouter()


@router.get("/tasks", response_model=List[schemas.Task])
def get_tasks(
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(models.Task)
    if project_id is not None:
        query = query.filter(models.Task.project_id == project_id)
    return query.order_by(models.Task.code).all()


@router.post("/tasks", response_model=schemas.Task)
async def create_task(
    task: schemas.TaskCreate,
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    existing = db.query(models.Task).filter(
        models.Task.code == task.code,
        models.Task.project_id == project_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Задача с кодом '{task.code}' уже существует")

    db_task = models.Task(**task.dict(), project_id=project_id)
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    touch_project(project_id, db)

    await manager.broadcast(
        {"type": "task_created", "event": "tasks", "data": {"id": db_task.id, "project_id": project_id}},
        event_type="tasks"
    )
    return db_task


@router.put("/tasks/{task_id}", response_model=schemas.Task)
async def update_task(
    task_id: int,
    task: schemas.TaskUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    for key, value in task.dict(exclude_unset=True).items():
        setattr(db_task, key, value)
    db.commit()
    db.refresh(db_task)
    touch_project(db_task.project_id, db)

    await manager.broadcast(
        {"type": "task_updated", "event": "tasks", "data": {"id": db_task.id}},
        event_type="tasks"
    )
    return db_task


@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    project_id = db_task.project_id
    db.delete(db_task)
    db.commit()
    touch_project(project_id, db)
    await manager.broadcast(
        {"type": "task_deleted", "event": "tasks", "data": {"id": task_id}},
        event_type="tasks"
    )
    return {"message": "Задача удалена", "id": task_id}


@router.delete("/tasks")
async def delete_all_tasks(
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.Task)
    if project_id is not None:
        query = query.filter(models.Task.project_id == project_id)
    count = query.count()
    query.delete()
    db.commit()
    touch_project(project_id, db)
    await manager.broadcast(
        {"type": "tasks_cleared", "event": "tasks", "data": {"project_id": project_id}},
        event_type="tasks"
    )
    return {"message": f"Удалено {count} задач"}
