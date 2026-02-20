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
    return query.order_by(models.Task.sort_order, models.Task.code).all()


# ─── Ручные строки: POST /tasks/custom ────────────────────────────────────
# ВАЖНО: этот роут должен стоять ДО роута POST /tasks,
# чтобы FastAPI не путал пути.
@router.post("/tasks/custom", response_model=schemas.Task)
async def create_custom_task(
    body: schemas.CustomTaskCreate,
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Создаёт ручную строку с авто-шифром С-N."""
    # 1. Генерируем шифр
    existing_custom = db.query(models.Task).filter(
        models.Task.project_id == project_id,
        models.Task.is_custom == True
    ).count()
    new_number = existing_custom + 1
    new_code = f"С-{new_number}"
    while db.query(models.Task).filter(
        models.Task.project_id == project_id,
        models.Task.code == new_code
    ).first():
        new_number += 1
        new_code = f"С-{new_number}"

    # 2. Определяем sort_order
    if body.insert_before_task_id:
        anchor = db.query(models.Task).filter(
            models.Task.id == body.insert_before_task_id
        ).first()
        if anchor:
            db.query(models.Task).filter(
                models.Task.project_id == project_id,
                models.Task.sort_order >= anchor.sort_order
            ).update({"sort_order": models.Task.sort_order + 1}, synchronize_session=False)
            new_sort_order = anchor.sort_order
        else:
            new_sort_order = _next_sort_order(db, project_id)
    else:
        new_sort_order = _next_sort_order(db, project_id)

    # 3. Создаём
    db_task = models.Task(
        project_id=project_id,
        code=new_code,
        name=body.name,
        unit=body.unit,
        volume_plan=body.volume_plan or 0,
        volume_fact=0,
        start_date_plan=body.start_date_plan,
        end_date_plan=body.end_date_plan,
        unit_price=body.unit_price or 0,
        labor_per_unit=body.labor_per_unit or 0,
        machine_hours_per_unit=body.machine_hours_per_unit or 0,
        executor=body.executor,
        parent_code=body.parent_code,
        is_section=False,
        is_custom=True,
        sort_order=new_sort_order,
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    touch_project(project_id, db)

    await manager.broadcast(
        {"type": "task_created", "event": "tasks",
         "data": {"id": db_task.id, "project_id": project_id, "is_custom": True}},
        event_type="tasks"
    )
    return db_task


# ─── DELETE /tasks/custom/all ─────────────────────────────────────────────────
# ВАЖНО: стоит ДО DELETE /tasks/{task_id}, иначе FastAPI подставляет
# строку "custom" как task_id, получает 422 Unprocessable Entity.
@router.delete("/tasks/custom/all")
async def delete_all_custom_tasks(
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Удалить все ручные строки проекта."""
    query = db.query(models.Task).filter(models.Task.is_custom == True)
    if project_id is not None:
        query = query.filter(models.Task.project_id == project_id)
    ids = [t.id for t in query.all()]
    query.delete(synchronize_session=False)
    db.commit()
    touch_project(project_id, db)
    await manager.broadcast(
        {"type": "tasks_cleared", "event": "tasks",
         "data": {"project_id": project_id, "custom_only": True}},
        event_type="tasks"
    )
    return {"message": f"Удалено {len(ids)} ручных строк", "ids": ids}


# ─── Стандартные роуты с {task_id} — идут ПОСЛЕ конкретных строк ─────────────

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

    # Новым задачам из импорта присваиваем sort_order по порядку кода,
    # чтобы они не смешивались с ручными строками (sort_order=0 по умолчанию).
    # Импорт идёт пакетами, поэтому sort_order=0 для всех обычных — норма.
    # GET /tasks сортирует (sort_order, code), так что обычные задачи
    # с sort_order=0 всегда встают перед ручными (sort_order >= 1).
    task_data = task.dict()
    if not task_data.get('sort_order'):
        task_data['sort_order'] = 0

    db_task = models.Task(**task_data, project_id=project_id)
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    touch_project(project_id, db)

    await manager.broadcast(
        {"type": "task_created", "event": "tasks",
         "data": {"id": db_task.id, "project_id": project_id}},
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


def _next_sort_order(db: Session, project_id: Optional[int]) -> int:
    """Возвращает sort_order = max(sort_order) + 1 по проекту."""
    max_order = db.query(func.max(models.Task.sort_order)).filter(
        models.Task.project_id == project_id
    ).scalar()
    return (max_order or 0) + 1
